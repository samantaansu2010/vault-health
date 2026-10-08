/**
 * A Research Workspace is a named, persistent set of REFERENCES to existing vault notes.
 * It never copies, moves or edits notes. Deleting a workspace deletes only this metadata.
 */
export interface WorkspaceRef {
  /** Vault path of the note when it was added (kept up to date on rename/move). */
  path: string;
  addedAt: number;
}

export interface WorkspaceDef {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  notes: WorkspaceRef[];
}

/** Exactly what is persisted in data.json for workspaces. */
export interface WorkspaceStoreData {
  version: 1;
  workspaces: WorkspaceDef[];
}

export class WorkspaceError extends Error {
  readonly code: 'empty-name' | 'name-too-long' | 'duplicate-name' | 'not-found';
  constructor(code: WorkspaceError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export const MAX_NAME_LENGTH = 80;
