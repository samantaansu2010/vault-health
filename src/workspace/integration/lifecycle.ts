import type { IssueRegistry } from '../../registry/IssueRegistry.ts';
import type { WorkspaceManager } from '../core/WorkspaceManager.ts';

/** A note/folder was renamed or moved: workspace references and ignore/review decisions follow it. */
export function handleRename(manager: WorkspaceManager, registry: IssueRegistry, oldPath: string, newPath: string): number {
  registry.migrateRename(oldPath, newPath);
  return manager.migrateRename(oldPath, newPath);
}

/** A workspace was deleted: drop only its own metadata and the decisions made inside it. */
export function handleWorkspaceDeleted(registry: IssueRegistry, workspaceId: string): void {
  registry.dropWorkspace(workspaceId);
}
