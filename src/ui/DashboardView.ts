import { ItemView, setIcon, type WorkspaceLeaf } from 'obsidian';
import type { HealthController } from '../controller.ts';
import type { DimensionId, Mode } from '../model/types.ts';
import { DIMENSION_LABEL, type DimensionScore } from '../scoring/HealthScorer.ts';
import type { RankedFinding } from '../scoring/priority.ts';
import { empty, fmtScore, renderFinding, scoreClass } from './common.ts';
import { ART_VIEW } from './ArtView.ts';
import { IgnoredModal } from './IgnoredModal.ts';
import { WorkspacesModal } from './workspace/modals.ts';
import { openWorkspace } from './workspace/open.ts';
import { RESEARCH_ANALYSIS_VIEW } from './ResearchAnalysisView.ts';

export const DASHBOARD_VIEW = 'vault-health-dashboard';

const MODE_LABEL: Record<Mode, string> = { vault: 'Vault', research: 'Research', art: 'Art & Media' };
const PHASE_LABEL = { notes: 'Reading notes', bodies: 'Reading research notes', assets: 'Listing attachments' } as const;

export class DashboardView extends ItemView {
  private ctl: HealthController;
  private unsub: (() => void) | null = null;
  private selected: DimensionId | null = null;
  private openFindings = new Set<string>();
  private housekeepingOpen = false;
  private progressEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, ctl: HealthController) {
    super(leaf);
    this.ctl = ctl;
  }

  getViewType(): string { return DASHBOARD_VIEW; }
  getDisplayText(): string { return 'Vault Health'; }
  override getIcon(): string { return 'activity'; }

  override async onOpen(): Promise<void> {
    this.contentEl.addClass('vh-root');
    this.unsub = this.ctl.onChange(() => this.render());
    this.render();
    if (!this.ctl.state || this.ctl.stale) void this.ctl.refresh();
  }

  override async onClose(): Promise<void> {
    this.unsub?.();
  }

  private render(): void {
    const ctl = this.ctl;
    if (ctl.running && this.progressEl && ctl.state) {
      this.updateProgress();
      return;
    }
    const root = this.contentEl;
    const scrollTop = root.scrollTop;
    root.empty();
    this.progressEl = null;

    this.renderHeader(root);
    if (ctl.error) root.createDiv({ cls: 'vh-error', text: `The scan failed: ${ctl.error}` });
    if (ctl.running) {
      this.progressEl = root.createDiv({ cls: 'vh-progress', attr: { role: 'status', 'aria-live': 'polite' } });
      this.updateProgress();
    }
    const st = ctl.state;
    if (!st) {
      if (!ctl.running && !ctl.error) empty(root, 'No scan yet', 'Press Rescan to analyze this vault. Nothing is modified; the scan only reads Obsidian’s existing index.');
      return;
    }
    this.renderSummary(root);
    this.renderConventionHint(root);
    this.renderDimensions(root);
    this.renderActionCenter(root);
    root.scrollTop = scrollTop;
  }

  private updateProgress(): void {
    const p = this.ctl.progress;
    if (!this.progressEl) return;
    this.progressEl.empty();
    this.progressEl.createSpan({ text: p ? `${PHASE_LABEL[p.phase]}… ${p.done.toLocaleString()} / ${p.total.toLocaleString()}` : 'Analyzing…' });
    const bar = this.progressEl.createEl('progress', { attr: { max: p?.total ?? 1, value: p?.done ?? 0, 'aria-label': 'Scan progress' } });
    bar.addClass('vh-progressbar');
  }

  private renderHeader(root: HTMLElement): void {
    const ctl = this.ctl;
    const header = root.createDiv({ cls: 'vh-header' });
    header.createEl('h2', { text: 'Vault Health' });
    const tools = header.createDiv({ cls: 'vh-tools' });

    const sel = tools.createEl('select', { attr: { 'aria-label': 'Mode' } });
    for (const m of ['vault', 'research', 'art'] as Mode[]) {
      const o = sel.createEl('option', { text: MODE_LABEL[m], attr: { value: m } });
      if (ctl.settings.mode === m) o.selected = true;
    }
    sel.addEventListener('change', () => ctl.setMode(sel.value as Mode));

    const mk = (label: string, icon: string, fn: () => void, disabled = false) => {
      const b = tools.createEl('button', { cls: 'vh-iconbtn', attr: { 'aria-label': label, title: label } });
      setIcon(b, icon);
      b.createSpan({ text: label });
      b.disabled = disabled;
      b.addEventListener('click', fn);
    };
    mk('Rescan', 'refresh-cw', () => void ctl.refresh(), ctl.running);
    mk('Workspaces', 'layout-dashboard', () => new WorkspacesModal(this.app, ctl, { onPick: (id) => void openWorkspace(this.app, id) }).open());
    mk('Research analysis', 'microscope', () => void this.openOther(RESEARCH_ANALYSIS_VIEW));
    mk('Art & Media', 'palette', () => void this.openOther(ART_VIEW));
    const n = ctl.registry.ignoredStates().length;
    mk(`Ignored (${n})`, 'eye-off', () => new IgnoredModal(this.app, ctl).open());

    const st = ctl.state;
    if (st) {
      const s = st.analysis.stats;
      header.createEl('p', {
        cls: 'vh-muted',
        text: `${s.analyzedNotes.toLocaleString()} notes analyzed${s.notes !== s.analyzedNotes ? ` (${s.notes - s.analyzedNotes} excluded)` : ''} · ${s.assets.toLocaleString()} attachments · scanned ${new Date(st.scannedAt).toLocaleTimeString()} in ${(st.scanMs / 1000).toFixed(1)}s · read-only`,
      });
    }
  }

  private async openOther(type: string): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(type)[0];
    const leaf = existing ?? this.app.workspace.getLeaf('tab');
    if (!existing) await leaf.setViewState({ type, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private renderSummary(root: HTMLElement): void {
    const rep = this.ctl.state!.report;
    const box = root.createDiv({ cls: 'vh-overall' });
    const num = box.createDiv({ cls: `vh-bignum ${scoreClass(rep.overall.score)}` });
    num.createSpan({ text: fmtScore(rep.overall.score) });
    num.createSpan({ cls: 'vh-outof', text: rep.overall.score === null ? '' : ' / 100' });
    const txt = box.createDiv();
    txt.createEl('strong', { text: 'Overall structural health' });
    txt.createEl('p', {
      cls: 'vh-muted',
      text: `A diagnostic summary of how your vault is structured, not a judgment of your knowledge. Based on ${rep.scoredMetrics} of ${rep.totalMetrics} applicable metrics${rep.ignoredItems ? `; ${rep.ignoredItems} ignored finding${rep.ignoredItems === 1 ? '' : 's'} excluded` : ''}.`,
    });
    const d = txt.createEl('details');
    d.createEl('summary', { text: 'How is this calculated?' });
    d.createEl('p', { cls: 'vh-formula', text: rep.overall.score === null ? (rep.overall.reason ?? '') : rep.overall.formula });
  }

  /** The most common first-run problem: conventions that match nothing. Say so instead of showing a hollow score. */
  private renderConventionHint(root: HTMLElement): void {
    const s = this.ctl.state!.analysis.stats;
    const a = this.ctl.settings.analysis;
    if (a.modules.research && s.researchNotes + s.sourceNotes === 0) {
      const d = root.createDiv({ cls: 'vh-hint' });
      d.createEl('strong', { text: 'No research or source notes matched your conventions.' });
      d.createEl('p', { text: 'Research and Sources scores stay empty until Vault Health knows how you mark research material. Open Settings → Vault Health → Research conventions to choose properties, tags or folders; the settings page shows live match counts and what your vault already uses.' });
    }
  }

  private renderDimensions(root: HTMLElement): void {
    const rep = this.ctl.state!.report;
    const grid = root.createDiv({ cls: 'vh-dims', attr: { role: 'list' } });
    for (const d of rep.dimensions) {
      const b = grid.createEl('button', {
        cls: `vh-dim${this.selected === d.id ? ' is-selected' : ''}`,
        attr: { role: 'listitem', 'aria-pressed': String(this.selected === d.id), 'aria-label': `${DIMENSION_LABEL[d.id]} ${fmtScore(d.score)}. Show breakdown.` },
      });
      b.createSpan({ cls: 'vh-dim-name', text: DIMENSION_LABEL[d.id] });
      b.createSpan({ cls: `vh-dim-score ${scoreClass(d.score)}`, text: fmtScore(d.score) });
      const scored = d.metrics.filter((m) => m.status === 'scored').length;
      b.createSpan({ cls: 'vh-muted vh-dim-sub', text: d.score === null ? 'not scored' : `${scored} metric${scored === 1 ? '' : 's'}` });
      b.addEventListener('click', () => {
        this.selected = this.selected === d.id ? null : d.id;
        this.render();
      });
    }
    const sel = rep.dimensions.find((d) => d.id === this.selected);
    if (sel) this.renderBreakdown(root, sel);
  }

  private renderBreakdown(root: HTMLElement, d: DimensionScore): void {
    const box = root.createDiv({ cls: 'vh-breakdown' });
    box.createEl('h3', { text: `${DIMENSION_LABEL[d.id]}: ${fmtScore(d.score)}` });
    box.createEl('p', { cls: 'vh-formula', text: d.score === null ? (d.reason ?? '') : d.formula });
    const wrap = box.createDiv({ cls: 'vh-tablewrap' });
    const t = wrap.createEl('table', { cls: 'vh-table' });
    const head = t.createEl('thead').createEl('tr');
    for (const h of ['Metric', 'Affected', 'Eligible', 'Rate', 'Tolerance', 'Weight', 'Share', 'Score']) head.createEl('th', { text: h, attr: { scope: 'col' } });
    const tb = t.createEl('tbody');
    for (const m of d.metrics) {
      const tr = tb.createEl('tr');
      const name = tr.createEl('th', { attr: { scope: 'row' } });
      name.createSpan({ text: m.label });
      if (m.tier === 'hygiene') name.createSpan({ cls: 'vh-badge vh-badge-quiet', text: 'housekeeping' });
      tr.createEl('td', { text: String(m.affected) + (m.ignored ? ` (+${m.ignored} ignored)` : '') });
      tr.createEl('td', { text: String(m.eligible) });
      tr.createEl('td', { text: m.status === 'not-applicable' ? '—' : `${(m.rate * 100).toFixed(1)}%` });
      tr.createEl('td', { text: `${Math.round(m.tolerance * 100)}%` });
      tr.createEl('td', { text: String(m.weight) });
      tr.createEl('td', { text: m.status === 'scored' ? `${Math.round(m.share * 100)}%` : '—' });
      tr.createEl('td', { cls: scoreClass(m.score), text: m.status === 'scored' ? fmtScore(m.score) : m.status === 'insufficient-data' ? 'too few' : 'n/a' });
      const ft = tb.createEl('tr', { cls: 'vh-formula-row' });
      ft.createEl('td', { attr: { colspan: '8' }, text: `${m.explain} ${m.formula}` });
    }
  }

  private renderActionCenter(root: HTMLElement): void {
    const st = this.ctl.state!;
    const sec = root.createDiv({ cls: 'vh-actioncenter' });
    sec.createEl('h3', { text: 'Action Center' });
    sec.createEl('p', { cls: 'vh-muted', text: 'Findings are ranked by what they say about your knowledge system: research integrity first, link structure second, housekeeping last. Nothing here changes your notes.' });

    const group = (tier: RankedFinding['finding']['tier']) => st.ranked.filter((r) => r.finding.tier === tier && r.open.length > 0);
    const integrity = group('integrity');
    const structure = group('structure');
    const hygiene = group('hygiene');

    if (integrity.length + structure.length + hygiene.length === 0) {
      empty(sec, 'No open findings', st.report.ignoredItems > 0 ? 'Everything flagged has been ignored. Use Ignored to review those decisions.' : 'Nothing was flagged by the enabled checks.');
      return;
    }
    const section = (title: string, sub: string, list: RankedFinding[]) => {
      if (list.length === 0) return;
      const s = sec.createDiv({ cls: 'vh-group' });
      s.createEl('h4', { text: title });
      s.createEl('p', { cls: 'vh-muted', text: sub });
      for (const r of list) renderFinding(s, this.ctl, this.app, r, { openSet: this.openFindings });
    };
    section('Needs attention', 'Research integrity: provenance, sources and disconnected research.', integrity);
    section('Worth investigating', 'Link structure: broken links, orphans, isolated clusters, missing files.', structure);

    if (hygiene.length > 0) {
      const det = sec.createEl('details', { cls: 'vh-group vh-housekeeping' });
      if (this.housekeepingOpen) det.setAttr('open', '');
      det.addEventListener('toggle', () => (this.housekeepingOpen = det.open));
      det.createEl('summary', { text: `Housekeeping (${hygiene.reduce((a, r) => a + r.open.length, 0)})` });
      det.createEl('p', { cls: 'vh-muted', text: 'Low-priority tidiness checks. They carry little weight in scores.' });
      for (const r of hygiene) renderFinding(det, this.ctl, this.app, r, { openSet: this.openFindings });
    }
  }
}
