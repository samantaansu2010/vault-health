import { MAX_NAME_LENGTH, WorkspaceError, type WorkspaceDef, type WorkspaceRef, type WorkspaceStoreData } from '../model/types.ts';

function sanitizeRef(x: unknown, fallbackTime: number): WorkspaceRef | null {
  if (typeof x !== 'object' || x === null) return null;
  const r = x as Record<string, unknown>;
  if (typeof r.path !== 'string' || r.path.trim() === '') return null;
  return { path: r.path, addedAt: typeof r.addedAt === 'number' ? r.addedAt : fallbackTime };
}

/** Defensive load: corrupt or hand-edited data is repaired or dropped, never thrown on. */
export function sanitizeStore(data: unknown, now: number): WorkspaceDef[] {
  const raw = (typeof data === 'object' && data !== null ? (data as Record<string, unknown>).workspaces : undefined);
  if (!Array.isArray(raw)) return [];
  const out: WorkspaceDef[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const w of raw as unknown[]) {
    if (typeof w !== 'object' || w === null) continue;
    const o = w as Record<string, unknown>;
    if (typeof o.id !== 'string' || !o.id || ids.has(o.id)) continue;
    let name = typeof o.name === 'string' ? o.name.trim().slice(0, MAX_NAME_LENGTH) : '';
    if (!name) name = 'Untitled workspace';
    let unique = name;
    for (let n = 2; names.has(unique.toLowerCase()); n++) unique = `${name} (${n})`;
    ids.add(o.id);
    names.add(unique.toLowerCase());
    const seen = new Set<string>();
    const notes: WorkspaceRef[] = [];
    for (const r of Array.isArray(o.notes) ? (o.notes as unknown[]) : []) {
      const ref = sanitizeRef(r, now);
      if (ref && !seen.has(ref.path)) {
        seen.add(ref.path);
        notes.push(ref);
      }
    }
    out.push({
      id: o.id,
      name: unique,
      createdAt: typeof o.createdAt === 'number' ? o.createdAt : now,
      updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : now,
      notes,
    });
  }
  return out;
}

/** Pure CRUD over workspace definitions. No Obsidian, no I/O, no vault access. */
export class WorkspaceManager {
  private items: WorkspaceDef[];
  private now: () => number;
  private seq = 0;
  /** Bumps on every change; lets views and caches know when to recompute. */
  revision = 0;

  constructor(data?: unknown, now: () => number = () => Date.now()) {
    this.now = now;
    this.items = sanitizeStore(data, now());
  }

  list(): WorkspaceDef[] {
    return this.items;
  }

  get(id: string | null | undefined): WorkspaceDef | undefined {
    return id ? this.items.find((w) => w.id === id) : undefined;
  }

  validateName(name: string, exceptId?: string): string {
    const n = name.trim();
    if (!n) throw new WorkspaceError('empty-name', 'A workspace needs a name.');
    if (n.length > MAX_NAME_LENGTH) throw new WorkspaceError('name-too-long', `Names are limited to ${MAX_NAME_LENGTH} characters.`);
    if (this.items.some((w) => w.id !== exceptId && w.name.toLowerCase() === n.toLowerCase())) {
      throw new WorkspaceError('duplicate-name', `A workspace named “${n}” already exists.`);
    }
    return n;
  }

  private touch(w: WorkspaceDef): void {
    w.updatedAt = this.now();
    this.revision++;
  }

  private mustGet(id: string): WorkspaceDef {
    const w = this.get(id);
    if (!w) throw new WorkspaceError('not-found', 'That workspace no longer exists.');
    return w;
  }

  create(name: string, initialPaths: readonly string[] = []): WorkspaceDef {
    const n = this.validateName(name);
    const t = this.now();
    let id: string;
    do id = `ws_${t.toString(36)}${(this.seq++).toString(36)}`; while (this.get(id));
    const w: WorkspaceDef = { id, name: n, createdAt: t, updatedAt: t, notes: [] };
    this.items.push(w);
    this.revision++;
    if (initialPaths.length) this.addNotes(id, initialPaths);
    return w;
  }

  rename(id: string, name: string): WorkspaceDef {
    const w = this.mustGet(id);
    w.name = this.validateName(name, id);
    this.touch(w);
    return w;
  }

  /** Deletes the workspace definition only. Nothing else in the vault is touched. */
  delete(id: string): boolean {
    const i = this.items.findIndex((w) => w.id === id);
    if (i < 0) return false;
    this.items.splice(i, 1);
    this.revision++;
    return true;
  }

  /** Returns how many references were actually added (duplicates are ignored). */
  addNotes(id: string, paths: readonly string[]): number {
    const w = this.mustGet(id);
    const have = new Set(w.notes.map((r) => r.path));
    const t = this.now();
    let added = 0;
    for (const p of paths) {
      if (!p || have.has(p)) continue;
      have.add(p);
      w.notes.push({ path: p, addedAt: t });
      added++;
    }
    if (added) this.touch(w);
    return added;
  }

  /** Removes references only; the notes themselves are never touched. */
  removeNotes(id: string, paths: readonly string[]): number {
    const w = this.mustGet(id);
    const drop = new Set(paths);
    const before = w.notes.length;
    w.notes = w.notes.filter((r) => !drop.has(r.path));
    const removed = before - w.notes.length;
    if (removed) this.touch(w);
    return removed;
  }

  /** Points an existing (missing) reference at a different note, keeping its original added date. */
  relink(id: string, oldPath: string, newPath: string): boolean {
    const w = this.mustGet(id);
    const ref = w.notes.find((r) => r.path === oldPath);
    if (!ref) return false;
    if (w.notes.some((r) => r.path === newPath)) w.notes = w.notes.filter((r) => r !== ref);
    else ref.path = newPath;
    this.touch(w);
    return true;
  }

  /**
   * A note or folder was renamed/moved in Obsidian: keep every workspace pointing at it.
   * Handles folder renames by prefix. Returns how many references changed.
   */
  migrateRename(oldPath: string, newPath: string): number {
    let changed = 0;
    for (const w of this.items) {
      let touched = false;
      const have = new Set(w.notes.map((r) => r.path));
      const next: WorkspaceRef[] = [];
      for (const r of w.notes) {
        let p = r.path;
        if (p === oldPath) p = newPath;
        else if (p.startsWith(oldPath + '/')) p = newPath + p.slice(oldPath.length);
        if (p !== r.path) {
          touched = true;
          changed++;
          if (have.has(p)) continue; // collision: the target is already a member
          have.add(p);
          next.push({ ...r, path: p });
        } else next.push(r);
      }
      if (touched) {
        w.notes = next;
        this.touch(w);
      }
    }
    return changed;
  }

  toJSON(): WorkspaceStoreData {
    return { version: 1, workspaces: this.items };
  }
}
