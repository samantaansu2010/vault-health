import { debounce, Platform, type Plugin } from 'obsidian';
import { runAnalysis, type AnalysisResult } from './analysis/AnalysisEngine.ts';
import { buildResearchAreas, type ResearchAreasData } from './analysis/research/areas.ts';
import { VaultScanner, type ScanProgress } from './index/VaultScanner.ts';
import type { VaultHealthSettings } from './model/settings.ts';
import type { FindingItem, Mode } from './model/types.ts';
import { IssueRegistry, type RegistryData } from './registry/IssueRegistry.ts';
import { WorkspaceManager } from './workspace/core/WorkspaceManager.ts';
import { analyzeWorkspace, type WorkspaceAnalysis } from './workspace/integration/analyze.ts';
import { handleRename, handleWorkspaceDeleted } from './workspace/integration/lifecycle.ts';
import type { WorkspaceDef, WorkspaceStoreData } from './workspace/model/types.ts';
import { computeReport, type HealthReport } from './scoring/HealthScorer.ts';
import { rankFindings, type RankedFinding } from './scoring/priority.ts';
import { DIMENSION_WEIGHTS, defaultScoring, mergeSettings } from './settings/defaults.ts';

export interface HealthState {
  analysis: AnalysisResult;
  report: HealthReport;
  ranked: RankedFinding[];
  /** Open (non-ignored) vault-analysis findings per path; shared by areas and workspaces. */
  issuesByPath: Map<string, number>;
  areas: ResearchAreasData;
  scannedAt: number;
  scanMs: number;
}

export interface PersistedData {
  settings: VaultHealthSettings;
  registry: RegistryData;
  workspaces?: WorkspaceStoreData;
}

type Listener = () => void;
type Debounced = { (): unknown; cancel(): unknown };

/** Orchestrates scan → analyze → registry → score. All vault access is read-only. */
export class HealthController {
  settings: VaultHealthSettings;
  registry: IssueRegistry;
  workspaces: WorkspaceManager;
  state: HealthState | null = null;
  progress: ScanProgress | null = null;
  running = false;
  error: string | null = null;
  /** Vault changed while no Vault Health view was open; refresh when one opens. */
  stale = false;

  private plugin: Plugin;
  private scanner: VaultScanner;
  private listeners = new Set<Listener>();
  private runId = 0;
  private pending = false;
  private mtimes = new Map<string, number>();
  readonly scheduleRefresh: Debounced;
  private save: Debounced;

  constructor(plugin: Plugin, data: unknown) {
    this.plugin = plugin;
    const d = (data ?? {}) as Partial<PersistedData>;
    this.settings = mergeSettings(d.settings);
    this.registry = new IssueRegistry(d.registry ?? {});
    this.workspaces = new WorkspaceManager(d.workspaces);
    this.scanner = new VaultScanner(plugin.app);
    this.scheduleRefresh = debounce(() => void this.refresh(), 2500, true);
    this.save = debounce(() => void this.persist(), 600, true);
  }

  onChange(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  async persist(): Promise<void> {
    const data: PersistedData = { settings: this.settings, registry: this.registry.toJSON(), workspaces: this.workspaces.toJSON() };
    await this.plugin.saveData(data);
  }

  saveSoon(): void {
    this.save();
  }

  async updateSettings(mutate: (s: VaultHealthSettings) => void, rescan: boolean): Promise<void> {
    mutate(this.settings);
    await this.persist();
    if (rescan) await this.refresh();
    else this.rescore();
  }

  setMode(mode: Mode): void {
    this.settings.mode = mode;
    this.settings.scoring = { ...this.settings.scoring, dimensionWeights: { ...DIMENSION_WEIGHTS[mode] } };
    this.saveSoon();
    this.rescore();
  }

  resetScoring(): void {
    this.settings.scoring = defaultScoring(this.settings.mode);
    this.saveSoon();
    this.rescore();
  }

  /** Full pass. If one is already running the request is queued, not dropped. */
  async refresh(): Promise<void> {
    if (this.running) {
      this.pending = true;
      this.runId++; // cancels the in-flight run; the queued one starts right after
      return;
    }
    this.running = true;
    this.stale = false;
    this.error = null;
    const id = ++this.runId;
    const cancelled = () => id !== this.runId;
    const t0 = Date.now();
    this.emit();
    try {
      const snapshot = await this.scanner.scan(this.settings.analysis, {
        budgetMs: Platform.isMobile ? 8 : 14,
        scanBodies: this.settings.scanBodies,
        isCancelled: cancelled,
        onProgress: (p) => {
          this.progress = p;
          this.emit();
        },
      });
      if (!snapshot) return;
      this.progress = null;
      const analysis = await runAnalysis(snapshot, this.settings.analysis, { isCancelled: cancelled });
      if (!analysis) return;
      this.mtimes = new Map(snapshot.notes.map((n) => [n.path, n.mtime]));
      for (const a of snapshot.assets) this.mtimes.set(a.path, a.mtime);
      this.registry.sync(analysis.outputs, (p) => this.mtimes.get(p));
      this.state = this.buildState(analysis, Date.now(), Date.now() - t0);
      this.save();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      console.error('Vault Health: scan failed', e);
    } finally {
      this.running = false;
      this.progress = null;
      this.emit();
      if (this.pending) {
        this.pending = false;
        void this.refresh();
      }
    }
  }

  private buildState(analysis: AnalysisResult, scannedAt: number, scanMs: number): HealthState {
    const issuesByPath = new Map<string, number>();
    for (const o of analysis.outputs) {
      for (const item of o.finding.items) {
        if (this.registry.statusOf(item.id) === 'ignored') continue;
        for (const p of item.paths) issuesByPath.set(p, (issuesByPath.get(p) ?? 0) + 1);
      }
    }
    return {
      analysis,
      report: computeReport(analysis.outputs, this.registry, this.settings.scoring, Date.now()),
      ranked: rankFindings(analysis.outputs, this.registry, this.settings.scoring),
      issuesByPath,
      areas: buildResearchAreas(analysis.ctx, analysis.provenance, (p) => issuesByPath.get(p) ?? 0),
      scannedAt,
      scanMs,
    };
  }

  /** Recompute scores/ranking from the last analysis (after ignore/review or weight changes). No rescan. */
  rescore(): void {
    if (this.state) this.state = this.buildState(this.state.analysis, this.state.scannedAt, this.state.scanMs);
    this.emit();
  }

  ignore(ruleId: string, item: FindingItem, note?: string): void {
    this.registry.ignore(ruleId, item, note);
    this.saveSoon();
    this.rescore();
  }

  restore(id: string): void {
    this.registry.restore(id);
    this.saveSoon();
    this.rescore();
  }

  review(ruleId: string, item: FindingItem): void {
    this.registry.review(ruleId, item, (p) => this.mtimes.get(p));
    this.saveSoon();
    this.rescore();
  }

  unreview(id: string): void {
    this.registry.unreview(id);
    this.saveSoon();
    this.rescore();
  }

  onRename(oldPath: string, newPath: string): void {
    if (handleRename(this.workspaces, this.registry, oldPath, newPath) > 0) this.emit();
    this.saveSoon();
  }

  // ---- Research Workspaces: metadata only; none of these touch the vault ----

  /** Persist and refresh views after any workspace change. */
  workspaceChanged(): void {
    this.saveSoon();
    this.emit();
  }

  createWorkspace(name: string, paths: readonly string[] = []): WorkspaceDef {
    const w = this.workspaces.create(name, paths);
    this.workspaceChanged();
    return w;
  }

  renameWorkspace(id: string, name: string): void {
    this.workspaces.rename(id, name);
    this.workspaceChanged();
  }

  /** Deletes the workspace definition and its own ignore/review decisions. Notes are never touched. */
  deleteWorkspace(id: string): void {
    if (this.workspaces.delete(id)) handleWorkspaceDeleted(this.registry, id);
    this.workspaceChanged();
  }

  addToWorkspace(id: string, paths: readonly string[]): number {
    const n = this.workspaces.addNotes(id, paths);
    if (n) this.workspaceChanged();
    return n;
  }

  removeFromWorkspace(id: string, paths: readonly string[]): number {
    const n = this.workspaces.removeNotes(id, paths);
    if (n) this.workspaceChanged();
    return n;
  }

  relinkInWorkspace(id: string, oldPath: string, newPath: string): void {
    if (this.workspaces.relink(id, oldPath, newPath)) this.workspaceChanged();
  }

  /** Workspace analysis on top of the latest vault analysis; null until the first scan finishes. */
  analyzeWorkspace(id: string): WorkspaceAnalysis | null {
    const st = this.state;
    const def = this.workspaces.get(id);
    if (!st || !def) return null;
    const a = analyzeWorkspace(st.analysis.ctx, st.analysis.provenance, def, {
      issueCount: (p) => st.issuesByPath.get(p) ?? 0,
      isIgnored: (i) => this.registry.statusOf(i.id) === 'ignored',
    });
    this.registry.touch(a.outputs, (p) => this.mtimes.get(p));
    return a;
  }
}
