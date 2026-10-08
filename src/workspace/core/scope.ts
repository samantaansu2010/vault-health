import type { WorkspaceDef, WorkspaceRef } from '../model/types.ts';

export interface WorkspaceScope {
  def: WorkspaceDef;
  /** Existing member notes, sorted by path. */
  members: string[];
  memberSet: Set<string>;
  /** References whose note is no longer at that path (deleted, or moved outside Obsidian). Never silently dropped. */
  missing: WorkspaceRef[];
}

export function resolveScope(def: WorkspaceDef, noteExists: (path: string) => boolean): WorkspaceScope {
  const members: string[] = [];
  const missing: WorkspaceRef[] = [];
  for (const r of def.notes) {
    if (noteExists(r.path)) members.push(r.path);
    else missing.push(r);
  }
  members.sort();
  return { def, members, memberSet: new Set(members), missing };
}
