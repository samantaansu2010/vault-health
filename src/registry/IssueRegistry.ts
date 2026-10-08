import { computeItemId } from '../model/ids.ts';
import type { FindingItem, ItemStatus, RuleOutput, Severity } from '../model/types.ts';
import type { RegistryView } from '../scoring/HealthScorer.ts';

/** What is persisted (data.json). No note content, only ids, paths and timestamps. */
export interface ItemState {
  ruleId: string;
  idKey?: string;
  paths: string[];
  status: ItemStatus;
  firstSeen: number;
  lastSeen: number;
  reviewedAt?: number;
  /** mtimes of the item's files when it was marked reviewed; a change reopens it. */
  mtimes?: Record<string, number>;
  note?: string;
}

export type RegistryData = Record<string, ItemState>;

const STALE_MS = 90 * 86_400_000;
const MAX_PATHS_STORED = 20;
const persistable = (sev: Severity) => sev === 'high' || sev === 'medium';

/**
 * Remembers what the user decided (ignored / reviewed) and when high/medium issues were first seen.
 * Pure: no Obsidian, no I/O. It never touches the vault.
 */
export class IssueRegistry implements RegistryView {
  private states: Map<string, ItemState>;
  private now: () => number;

  constructor(data: RegistryData = {}, now: () => number = () => Date.now()) {
    this.states = new Map(Object.entries(data));
    this.now = now;
  }

  statusOf(id: string): ItemStatus {
    return this.states.get(id)?.status ?? 'open';
  }

  firstSeen(id: string): number | undefined {
    return this.states.get(id)?.firstSeen;
  }

  get(id: string): ItemState | undefined {
    return this.states.get(id);
  }

  ignoredStates(): [string, ItemState][] {
    return [...this.states.entries()].filter(([, s]) => s.status === 'ignored');
  }

  /** Call after every COMPLETED analysis (never after a cancelled one). */
  sync(outputs: RuleOutput[], mtimeOf: (path: string) => number | undefined): void {
    const now = this.now();
    const seen = new Set<string>();
    for (const { finding } of outputs) {
      for (const item of finding.items) {
        seen.add(item.id);
        const sev = item.severity ?? finding.severity;
        let st = this.states.get(item.id);
        if (!st) {
          if (!persistable(sev)) continue;
          st = this.fresh(finding.ruleId, item, now);
          this.states.set(item.id, st);
        }
        st.lastSeen = now;
        if (st.status === 'reviewed' && st.mtimes) {
          const changed = Object.entries(st.mtimes).some(([p, m]) => mtimeOf(p) !== m);
          if (changed) {
            st.status = 'open';
            delete st.reviewedAt;
            delete st.mtimes;
          }
        }
      }
    }
    for (const [id, st] of [...this.states]) {
      if (seen.has(id)) continue;
      // Workspace findings are produced per workspace, not by the global scan, so the global sync must not prune them.
      if (st.ruleId.startsWith('workspace.')) {
        if (now - st.lastSeen > STALE_MS * 4) this.states.delete(id);
        continue;
      }
      if (st.status === 'open' || now - st.lastSeen > STALE_MS) this.states.delete(id);
    }
  }

  /** Keeps workspace-finding decisions alive (lastSeen) and expires reviews whose notes changed. */
  touch(outputs: RuleOutput[], mtimeOf: (path: string) => number | undefined): void {
    const now = this.now();
    for (const { finding } of outputs) {
      for (const item of finding.items) {
        const st = this.states.get(item.id);
        if (!st) continue;
        st.lastSeen = now;
        if (st.status === 'reviewed' && st.mtimes && Object.entries(st.mtimes).some(([p, m]) => mtimeOf(p) !== m)) {
          st.status = 'open';
          delete st.reviewedAt;
          delete st.mtimes;
        }
      }
    }
  }

  /** Forgets every decision made inside a deleted workspace. Vault findings are untouched. */
  dropWorkspace(workspaceId: string): void {
    for (const [id, st] of [...this.states]) if (st.idKey?.startsWith(`ws:${workspaceId}:`)) this.states.delete(id);
  }

  private fresh(ruleId: string, item: FindingItem, now: number): ItemState {
    const st: ItemState = {
      ruleId, paths: item.paths.slice(0, MAX_PATHS_STORED), status: 'open', firstSeen: now, lastSeen: now,
    };
    if (item.idKey !== undefined) st.idKey = item.idKey;
    return st;
  }

  private ensure(ruleId: string, item: FindingItem): ItemState {
    let st = this.states.get(item.id);
    if (!st) this.states.set(item.id, (st = this.fresh(ruleId, item, this.now())));
    return st;
  }

  ignore(ruleId: string, item: FindingItem, note?: string): void {
    const st = this.ensure(ruleId, item);
    st.status = 'ignored';
    if (note) st.note = note;
    delete st.reviewedAt;
    delete st.mtimes;
  }

  restore(id: string): void {
    const st = this.states.get(id);
    if (!st) return;
    st.status = 'open';
    delete st.note;
  }

  review(ruleId: string, item: FindingItem, mtimeOf: (path: string) => number | undefined): void {
    const st = this.ensure(ruleId, item);
    st.status = 'reviewed';
    st.reviewedAt = this.now();
    const mtimes: Record<string, number> = {};
    for (const p of item.paths.slice(0, MAX_PATHS_STORED)) {
      const m = mtimeOf(p);
      if (m !== undefined) mtimes[p] = m;
    }
    st.mtimes = mtimes;
  }

  unreview(id: string): void {
    const st = this.states.get(id);
    if (!st || st.status !== 'reviewed') return;
    st.status = 'open';
    delete st.reviewedAt;
    delete st.mtimes;
  }

  /** Keeps ignore/review decisions attached to a note that was renamed or moved. */
  migrateRename(oldPath: string, newPath: string): void {
    for (const [id, st] of [...this.states]) {
      const keyHasPath = st.idKey !== undefined && st.idKey.endsWith(`:${oldPath}`);
      if (!st.paths.includes(oldPath) && !keyHasPath) continue;
      const paths = st.paths.map((p) => (p === oldPath ? newPath : p));
      const idKey = st.idKey !== undefined && keyHasPath ? st.idKey.slice(0, st.idKey.length - oldPath.length) + newPath : st.idKey;
      const newId = computeItemId(st.ruleId, paths, idKey);
      this.states.delete(id);
      const moved: ItemState = { ...st, paths };
      if (idKey !== undefined) moved.idKey = idKey;
      if (moved.mtimes && oldPath in moved.mtimes) {
        const { [oldPath]: m, ...rest } = moved.mtimes;
        moved.mtimes = { ...rest, [newPath]: m as number };
      }
      this.states.set(newId, moved);
    }
  }

  toJSON(): RegistryData {
    return Object.fromEntries(this.states);
  }
}
