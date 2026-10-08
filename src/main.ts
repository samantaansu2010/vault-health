import { Notice, Plugin, type TAbstractFile } from 'obsidian';
import { HealthController } from './controller.ts';
import { VaultHealthSettingTab } from './settings/SettingsTab.ts';
import { DASHBOARD_VIEW, DashboardView } from './ui/DashboardView.ts';
import { ART_VIEW, ArtView } from './ui/ArtView.ts';
import { IgnoredModal } from './ui/IgnoredModal.ts';
import { WorkspaceView } from './ui/workspace/WorkspaceView.ts';
import { WorkspacesModal, PromptModal } from './ui/workspace/modals.ts';
import { openWorkspace, WORKSPACE_VIEW } from './ui/workspace/open.ts';
import { RESEARCH_ANALYSIS_VIEW, ResearchAnalysisView } from './ui/ResearchAnalysisView.ts';

export default class VaultHealthPlugin extends Plugin {
  ctl!: HealthController;

  override async onload(): Promise<void> {
    this.ctl = new HealthController(this, await this.loadData());

    this.registerView(DASHBOARD_VIEW, (leaf) => new DashboardView(leaf, this.ctl));
    this.registerView(RESEARCH_ANALYSIS_VIEW, (leaf) => new ResearchAnalysisView(leaf, this.ctl));
    this.registerView(WORKSPACE_VIEW, (leaf) => new WorkspaceView(leaf, this.ctl));
    this.registerView(ART_VIEW, (leaf) => new ArtView(leaf, this.ctl));
    this.addSettingTab(new VaultHealthSettingTab(this.app, this, this.ctl));

    this.addRibbonIcon('activity', 'Open Vault Health', () => void this.activate(DASHBOARD_VIEW));
    this.addCommand({ id: 'open-dashboard', name: 'Open dashboard', callback: () => void this.activate(DASHBOARD_VIEW) });
    this.addCommand({ id: 'create-workspace', name: 'Create research workspace…', callback: () => new PromptModal(this.app, {
      title: 'New research workspace', label: 'Name', cta: 'Create',
      onSubmit: (name) => void openWorkspace(this.app, this.ctl.createWorkspace(name).id),
    }).open() });
    this.addCommand({ id: 'open-workspace', name: 'Open research workspace…', callback: () => new WorkspacesModal(this.app, this.ctl, { onPick: (id) => void openWorkspace(this.app, id) }).open() });
    this.addCommand({ id: 'add-note-to-workspace', name: 'Add current note to a research workspace…', checkCallback: (checking: boolean) => {
      const file = this.app.workspace.getActiveFile();
      if (!file || file.extension !== 'md') return false;
      if (!checking) {
        new WorkspacesModal(this.app, this.ctl, {
          heading: `Add “${file.basename}” to…`, pickLabel: 'Add here',
          onPick: (id) => {
            const added = this.ctl.addToWorkspace(id, [file.path]);
            new Notice(added ? `Added a reference to “${file.basename}”. The note itself was not changed.` : `“${file.basename}” is already in that workspace.`);
          },
        }).open();
      }
      return true;
    } });
    this.addCommand({ id: 'open-research-analysis', name: 'Open research analysis', callback: () => void this.activate(RESEARCH_ANALYSIS_VIEW) });
    this.addCommand({ id: 'open-art-media', name: 'Open Art & Media', callback: () => void this.activate(ART_VIEW) });
    this.addCommand({ id: 'rescan', name: 'Rescan vault', callback: () => void this.ctl.refresh() });
    this.addCommand({ id: 'show-ignored', name: 'Show ignored findings', callback: () => new IgnoredModal(this.app, this.ctl).open() });

    // No work at startup: the first scan happens when a Vault Health view opens.
    this.registerEvent(this.app.metadataCache.on('resolved', () => {
      if (!this.ctl.state) return;
      if (this.viewOpen() && this.ctl.settings.autoRefresh) this.ctl.scheduleRefresh();
      else this.ctl.stale = true;
    }));
    this.registerEvent(this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => this.ctl.onRename(oldPath, file.path)));
  }

  override onunload(): void {
    this.ctl.scheduleRefresh.cancel();
    void this.ctl.persist();
  }

  private viewOpen(): boolean {
    const ws = this.app.workspace;
    return [DASHBOARD_VIEW, RESEARCH_ANALYSIS_VIEW, ART_VIEW, WORKSPACE_VIEW].some((t) => ws.getLeavesOfType(t).length > 0);
  }

  private async activate(type: string): Promise<void> {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(type)[0];
    if (!leaf) {
      leaf = ws.getLeaf('tab');
      await leaf.setViewState({ type, active: true });
    }
    await ws.revealLeaf(leaf);
  }
}
