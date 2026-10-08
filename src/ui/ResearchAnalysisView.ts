import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type { ResearchArea } from '../analysis/research/areas.ts';
import type { ProvenanceStatus } from '../analysis/research/provenance.ts';
import type { HealthController } from '../controller.ts';
import { empty, renderFinding } from './common.ts';
import { renderCoverage, renderNoteTable, renderSourceTable } from './research/tables.ts';

export const RESEARCH_ANALYSIS_VIEW = 'vault-health-research-analysis';

/**
 * Research analysis: an AUTOMATIC lens over the whole vault. It groups research/source notes into areas by
 * their links and shows provenance for each. It is not a Research Workspace: workspaces are created by you,
 * from notes you choose (see src/workspace). It reports structure and provenance only, never claim validity.
 */
export class ResearchAnalysisView extends ItemView {
  private ctl: HealthController;
  private unsub: (() => void) | null = null;
  private selected: string | null = null;
  private filter: 'all' | ProvenanceStatus = 'all';
  private tab: 'notes' | 'sources' | 'issues' = 'notes';
  private openFindings = new Set<string>();

  constructor(leaf: WorkspaceLeaf, ctl: HealthController) {
    super(leaf);
    this.ctl = ctl;
  }

  getViewType(): string { return RESEARCH_ANALYSIS_VIEW; }
  getDisplayText(): string { return 'Research analysis'; }
  override getIcon(): string { return 'microscope'; }

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
    const root = this.contentEl;
    root.empty();
    const header = root.createDiv({ cls: 'vh-header' });
    header.createEl('h2', { text: 'Research analysis' });
    header.createEl('p', {
      cls: 'vh-muted',
      text: 'Automatic: groups your research and source notes by their links and shows the provenance of each. To work on a specific topic, create a Research Workspace from notes you choose. This does not assess whether any claim is correct.',
    });
    const st = this.ctl.state;
    if (!st) return void empty(root, this.ctl.running ? 'Scanning…' : 'No scan yet', this.ctl.running ? 'The analysis appears when the first scan finishes.' : 'Open the dashboard and press Rescan.');
    const ws = st.areas;
    if (ws.totals.researchNotes + ws.totals.sources === 0) {
      return void empty(root, 'No research or source notes matched your conventions',
        'Choose how you mark research material in Settings → Vault Health → Research conventions (properties, tags, folders, or a combination). The settings page shows what your vault already uses and live match counts.');
    }
    renderCoverage(root, ws.totals, 'the vault');

    const layout = root.createDiv({ cls: 'vh-split' });
    const nav = layout.createEl('nav', { cls: 'vh-areas', attr: { 'aria-label': 'Research areas' } });
    if (!ws.areas.some((a) => a.id === this.selected)) this.selected = ws.areas[0]?.id ?? null;
    for (const a of ws.areas) {
      const b = nav.createEl('button', { cls: `vh-area${a.id === this.selected ? ' is-selected' : ''}`, attr: { 'aria-pressed': String(a.id === this.selected) } });
      b.createDiv({ cls: 'vh-area-label', text: a.label });
      b.createDiv({ cls: 'vh-muted', text: `${a.stats.researchNotes} research · ${a.stats.sources} sources${a.stats.issues ? ` · ${a.stats.issues} open issue${a.stats.issues === 1 ? '' : 's'}` : ''}` });
      b.addEventListener('click', () => { this.selected = a.id; this.render(); });
    }
    const area = ws.areas.find((a) => a.id === this.selected);
    const main = layout.createDiv({ cls: 'vh-areamain' });
    if (area) this.renderArea(main, area);
  }

  private renderArea(main: HTMLElement, a: ResearchArea): void {
    main.createEl('h3', { text: a.label });
    const tabs = main.createDiv({ cls: 'vh-tabs', attr: { role: 'tablist' } });
    const tabBtn = (id: 'notes' | 'sources' | 'issues', label: string) => {
      const b = tabs.createEl('button', { text: label, attr: { role: 'tab', 'aria-selected': String(this.tab === id) } });
      if (this.tab === id) b.addClass('is-selected');
      b.addEventListener('click', () => { this.tab = id; this.render(); });
    };
    tabBtn('notes', `Research notes (${a.stats.researchNotes})`);
    tabBtn('sources', `Sources (${a.stats.sources})`);
    tabBtn('issues', `Issues (${a.stats.issues})`);
    if (this.tab === 'notes') renderNoteTable(main, this.app, a.notes, { filter: this.filter, onFilter: (f) => { this.filter = f; this.render(); } });
    else if (this.tab === 'sources') renderSourceTable(main, this.app, a.sources);
    else this.renderIssues(main, a);
  }

  private renderIssues(main: HTMLElement, a: ResearchArea): void {
    const st = this.ctl.state!;
    const paths = new Set<string>([...a.notes.map((n) => n.path), ...a.sources.map((s) => s.path)]);
    let any = false;
    for (const r of st.ranked.filter((x) => x.finding.tier === 'integrity' || x.finding.ruleId.startsWith('research.'))) {
      if (r.open.some((i) => i.paths.some((p) => paths.has(p)))) {
        any = true;
        renderFinding(main, this.ctl, this.app, r, { openSet: this.openFindings, filter: (i) => i.paths.some((p) => paths.has(p)) });
      }
    }
    if (!any) empty(main, 'No open integrity findings in this area', 'Ignored findings are excluded; use Ignored on the dashboard to review them.');
  }
}
