import type { App } from 'obsidian';
import type { WorkspaceView } from './WorkspaceView.ts';

export const WORKSPACE_VIEW = 'vault-health-workspace';

/** Opens a workspace in its own tab (re-using the tab if that workspace is already open). Read-only. */
export async function openWorkspace(app: App, workspaceId: string): Promise<void> {
  const ws = app.workspace;
  const existing = ws.getLeavesOfType(WORKSPACE_VIEW).find((l) => (l.view as WorkspaceView).workspaceId === workspaceId);
  if (existing) return void (await ws.revealLeaf(existing));
  const leaf = ws.getLeaf('tab');
  await leaf.setViewState({ type: WORKSPACE_VIEW, active: true, state: { workspaceId } });
  await ws.revealLeaf(leaf);
}
