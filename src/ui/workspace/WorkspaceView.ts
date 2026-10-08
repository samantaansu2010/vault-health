import { ItemView, Notice, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import type { ProvenanceStatus } from '../../analysis/research/provenance.ts';
import type { HealthController } from '../../controller.ts';
import { rankFindings } from '../../scoring/priority.ts';
import { connectedFor, memberItemFilter, type WorkspaceAnalysis } from '../../workspace/integration/analyze.ts';
import { empty, openPath, pathButton, renderFinding } from '../common.ts';
import { renderCoverage, renderNoteTable, renderSourceTable } from '../research/tables.ts';
import { getLayout, renderLocalGraph, type GraphCache } from './GraphRender.ts';
import { ConfirmModal, NotePickerModal, PromptModal, WorkspacesModal } from './modals.ts';
import { WORKSPACE_VIEW } from './open.ts';

type Tab = 'overview' | 'notes' | 'graph' | 'connected' | 'sources' | 'diagnostics';
type NoteSort = 'name' | 'fewest-internal' | 'most-external';
const TABS: [Tab, string][] = [
  ['overview', 'Overview'], ['notes', 'Notes'], ['graph', 'Graph & clusters'], ['connected', 'Add connected'], ['sources', 'Sources'], ['diagnostics', 'Diagnostics'],
];

const short = (p: string) => (p.split('/').pop() ?? p).replace(/\.md$/, '');

/**
 * A user-created Research Workspace: a persistent, named set of REFERENCES to existing notes.
 * Every number comes from the vault-wide analysis scoped to the members; closing this tab or deleting the
 * workspace never changes a note.
 */
export class WorkspaceView extends ItemView {
  private ctl: HealthController;
  workspaceId: string | null = null;
  private unsub: (() => void) | null = null;
  private tab: Tab = 'overview';
  private sort: NoteSort = 'name';
  private selected = new Set<string>();
  private minConnections = 1;
  private pickedCandidates = new Set<string>();
  private focusCluster: number | null = null;
  private graphCache: GraphCache | null = null;
  private noteFilter: 'all' | ProvenanceStatus = 'all';
  private openFindings = new Set<string>();

  constructor(leaf: WorkspaceLeaf, ctl: HealthController) {
    super(leaf);
    this.ctl = ctl;
  }

  getViewType(): string { return WORKSPACE_VIEW; }
  getDisplayText(): string { return this.ctl.workspaces.get(this.workspaceId)?.name ?? 'Research workspace'; }
  override getIcon(): string { return 'layout-dashboard'; }

  override getState(): Record<string, unknown> {
    return { workspaceId: this.workspaceId };
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const id = (state as { workspaceId?: unknown } | null)?.workspaceId;
    this.workspaceId = typeof id === 'string' ? id : null;
    this.selected.clear();
    this.pickedCandidates.clear();
    this.focusCluster = null;
    this.render();
    void result;
  }

  override async onOpen(): Promise<void> {
    this.contentEl.addClass('vh-root');
    this.unsub = this.ctl.onChange(() => this.render());
    this.render();
    if (!this.ctl.state || this.ctl.stale) void this.ctl.refresh();
  }

  override async onClose(): Promise<void> {
    this.unsub?.(); // closing a workspace tab only detaches this view; nothing is saved to or removed from the vault
  }

  private switchTo(id: string): void {
    this.workspaceId = id;
    this.selected.clear();
    this.pickedCandidates.clear();
    this.focusCluster = null;
    this.app.workspace.requestSaveLayout();
    this.render();
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    // keep the tab title in sync after a rename (updateHeader exists at runtime on workspace leaves)
    (this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
    const def = this.ctl.workspaces.get(this.workspaceId);
    if (!def) return void this.renderNoWorkspace(root);
    this.renderHeader(root, def.id, def.name, def.notes.length);
    const st = this.ctl.state;
    if (!st) {
      return void empty(root, this.ctl.running ? 'Scanning…' : 'No scan yet', 'The workspace is analyzed once the vault scan finishes. Your workspace definition is already saved.');
    }
    const a = this.ctl.analyzeWorkspace(def.id);
    if (!a) return void empty(root, 'Workspace unavailable', 'It may have been deleted in another window.');

    const tabs = root.createDiv({ cls: 'vh-tabs', attr: { role: 'tablist' } });
    for (const [id, label] of TABS) {
      const b = tabs.createEl('button', { text: label, attr: { role: 'tab', 'aria-selected': String(this.tab === id) } });
      if (this.tab === id) b.addClass('is-selected');
      b.addEventListener('click', () => { this.tab = id; this.render(); });
    }
    const body = root.createDiv({ cls: 'vh-tabbody' });
    switch (this.tab) {
      case 'overview': return this.renderOverview(body, a);
      case 'notes': return this.renderNotes(body, def.id, a);
      case 'graph': return this.renderGraph(body, a);
      case 'connected': return this.renderConnected(body, def.id, a);
      case 'sources': return this.renderSources(body, def.id, a);
      case 'diagnostics': return this.renderDiagnostics(body, a);
    }
  }

  private renderNoWorkspace(root: HTMLElement): void {
    root.createEl('h2', { text: 'Research workspaces' });
    const list = this.ctl.workspaces.list();
    empty(root, list.length ? 'Choose a workspace' : 'No workspaces yet',
      'A research workspace is a named set of references to notes you choose, with its own graph, sources and diagnostics. Your notes are never copied or changed.');
    const row = root.createDiv({ cls: 'vh-actions' });
    row.createEl('button', { text: 'New workspace…', cls: 'mod-cta' }).addEventListener('click', () => this.promptNew());
    if (list.length) row.createEl('button', { text: 'Open existing…' }).addEventListener('click', () => this.chooser());
  }

  private promptNew(): void {
    new PromptModal(this.app, {
      title: 'New research workspace', label: 'Name', cta: 'Create',
      onSubmit: (name) => this.switchTo(this.ctl.createWorkspace(name).id),
    }).open();
  }

  /** Pick another workspace: re-use the tab that already shows it, otherwise switch this tab in place. */
  private chooser(): void {
    new WorkspacesModal(this.app, this.ctl, {
      onPick: (id) => {
        const other = this.app.workspace.getLeavesOfType(WORKSPACE_VIEW).find((l) => l !== this.leaf && (l.view as WorkspaceView).workspaceId === id);
        if (other) void this.app.workspace.revealLeaf(other);
        else this.switchTo(id);
      },
    }).open();
  }

  private renderHeader(root: HTMLElement, id: string, name: string, count: number): void {
    const header = root.createDiv({ cls: 'vh-header' });
    header.createEl('h2', { text: name });
    header.createEl('p', {
      cls: 'vh-muted',
      text: `${count} note reference${count === 1 ? '' : 's'}. A workspace only stores references: closing or deleting it never changes your notes.`,
    });
    const tools = header.createDiv({ cls: 'vh-tools' });
    const btn = (label: string, fn: () => void, cta = false) => {
      const b = tools.createEl('button', { text: label });
      if (cta) b.addClass('mod-cta');
      b.addEventListener('click', fn);
    };
    btn('Add notes…', () => this.addNotes(id), true);
    btn('Rename…', () => new PromptModal(this.app, {
      title: 'Rename workspace', label: 'Name', initial: name, cta: 'Rename',
      onSubmit: (n) => { this.ctl.renameWorkspace(id, n); this.app.workspace.requestSaveLayout(); },
    }).open());
    btn('Switch…', () => this.chooser());
    btn('New…', () => this.promptNew());
    btn('Delete workspace…', () => new ConfirmModal(this.app, {
      title: `Delete “${name}”?`,
      body: `This deletes only the workspace: its name and its list of ${count} note reference${count === 1 ? '' : 's'}. The notes themselves are not touched.`,
      cta: 'Delete workspace',
      onConfirm: () => {
        this.ctl.deleteWorkspace(id);
        new Notice(`Deleted workspace “${name}”. Your notes were not changed.`);
        this.workspaceId = null;
        this.render();
      },
    }).open());
  }

  private addNotes(id: string): void {
    const def = this.ctl.workspaces.get(id);
    if (!def) return;
    new NotePickerModal(this.app, this.ctl, new Set(def.notes.map((r) => r.path)), (paths) => {
      const n = this.ctl.addToWorkspace(id, paths);
      new Notice(`Added ${n} note reference${n === 1 ? '' : 's'} to the workspace.`);
    }).open();
  }

  // ---------------- tabs ----------------

  private renderOverview(body: HTMLElement, a: WorkspaceAnalysis): void {
    const s = a.stats;
    if (s.members === 0 && s.missing === 0) {
      empty(body, 'This workspace is empty', 'Use “Add notes…” to pick existing notes, or add notes from the “Add connected” tab once it has a few members.');
      return;
    }
    const grid = body.createDiv({ cls: 'vh-chain', attr: { 'aria-label': 'Workspace statistics' } });
    const cell = (n: string | number, label: string, hint?: string) => {
      const c = grid.createDiv({ cls: 'vh-chaincell', attr: hint ? { title: hint } : {} });
      c.createDiv({ cls: 'vh-chainnum', text: String(n) });
      c.createDiv({ cls: 'vh-muted', text: label });
    };
    cell(s.members, 'notes');
    cell(s.internalConnections, 'internal connections', 'Pairs of workspace notes linked to each other');
    cell(s.externalOut, 'links out', 'Links from workspace notes to notes outside it');
    cell(s.externalIn, 'links in', 'Notes outside the workspace that link to workspace notes');
    cell(`${Math.round(s.density * 100)}%`, 'density', 'Connected pairs ÷ possible pairs');
    cell(s.clusters, 'connected groups');
    cell(s.isolated, 'unconnected notes');
    cell(s.sourcesAssociated, 'sources');
    cell(`${s.sourced}/${s.researchNotes}`, 'research notes sourced');
    cell(s.openIssues, 'open findings');
    if (s.missing) body.createEl('p', { cls: 'vh-error', text: `${s.missing} note reference${s.missing === 1 ? '' : 's'} can no longer be found. See the Notes tab.` });
    const sum = body.createEl('p', { cls: 'vh-muted' });
    sum.setText(s.clusters <= 1
      ? `The notes form ${s.clusters === 1 ? 'one connected group' : 'no connected group yet'}${s.isolated ? `, plus ${s.isolated} note${s.isolated === 1 ? '' : 's'} not linked to the rest` : ''}.`
      : `The notes form ${s.clusters} separate connected groups (the largest holds ${Math.round(s.largestClusterShare * 100)}% of the notes)${s.isolated ? `, plus ${s.isolated} unconnected` : ''}.`);
    body.createEl('p', { cls: 'vh-muted', text: 'These are structural observations from links and properties, not judgments about the topic.' });
  }

  private renderNotes(body: HTMLElement, id: string, a: WorkspaceAnalysis): void {
    const g = a.graph;
    if (a.scope.missing.length) {
      const box = body.createDiv({ cls: 'vh-hint' });
      box.createEl('strong', { text: 'Notes that can no longer be found' });
      box.createEl('p', { text: 'These references are kept until you decide. They may have been deleted, or moved/renamed while Obsidian was not watching.' });
      for (const ref of a.scope.missing) {
        const row = box.createDiv({ cls: 'vh-item' });
        row.createDiv({ cls: 'vh-item-head' }).createSpan({ text: ref.path });
        const actions = row.createDiv({ cls: 'vh-actions' });
        for (const cand of (a.relinks.get(ref.path) ?? []).slice(0, 3)) {
          actions.createEl('button', { text: `Relink to ${cand}` }).addEventListener('click', () => this.ctl.relinkInWorkspace(id, ref.path, cand));
        }
        actions.createEl('button', { text: 'Remove reference' }).addEventListener('click', () => this.ctl.removeFromWorkspace(id, [ref.path]));
      }
    }
    if (g.members.length === 0) return void empty(body, 'No notes to show', 'Add existing notes to this workspace.');

    const bar = body.createDiv({ cls: 'vh-tools' });
    const sel = bar.createEl('select', { attr: { 'aria-label': 'Sort notes' } });
    for (const [v, l] of [['name', 'Sort: name'], ['fewest-internal', 'Sort: fewest internal connections'], ['most-external', 'Sort: most external connections']] as [NoteSort, string][]) {
      const o = sel.createEl('option', { text: l, attr: { value: v } });
      if (this.sort === v) o.selected = true;
    }
    sel.addEventListener('change', () => { this.sort = sel.value as NoteSort; this.render(); });
    const rm = bar.createEl('button', { text: `Remove selected (${this.selected.size})`, attr: { title: 'Removes the references only; the notes are not changed.' } });
    rm.disabled = this.selected.size === 0;
    rm.addEventListener('click', () => {
      const n = this.ctl.removeFromWorkspace(id, [...this.selected]);
      this.selected.clear();
      new Notice(`Removed ${n} reference${n === 1 ? '' : 's'}. The notes themselves were not changed.`);
    });

    const idx = g.members.map((_, i) => i);
    const ext = (i: number) => (g.externalOut[i] as number) + (g.externalIn[i] as number);
    idx.sort((x, y) => this.sort === 'fewest-internal' ? (g.internalDegree[x] as number) - (g.internalDegree[y] as number) || x - y
      : this.sort === 'most-external' ? ext(y) - ext(x) || x - y
      : (short(g.members[x] as string)).localeCompare(short(g.members[y] as string)));

    const t = body.createDiv({ cls: 'vh-tablewrap' }).createEl('table', { cls: 'vh-table' });
    const head = t.createEl('thead').createEl('tr');
    head.createEl('th', { attr: { scope: 'col' } }).createSpan({ cls: 'vh-sr', text: 'Select' });
    for (const h of ['Note', 'Roles', 'Internal (in / out)', 'External (out / in)', 'Group', 'Findings', '']) head.createEl('th', { text: h, attr: { scope: 'col' } });
    const tb = t.createEl('tbody');
    const roles = this.ctl.state!.analysis.ctx.allByPath;
    for (const i of idx.slice(0, 500)) {
      const path = g.members[i] as string;
      const tr = tb.createEl('tr');
      const box = tr.createEl('td').createEl('input', { type: 'checkbox', attr: { 'aria-label': `Select ${short(path)}` } });
      box.checked = this.selected.has(path);
      box.addEventListener('change', () => {
        if (box.checked) this.selected.add(path);
        else this.selected.delete(path);
        rm.setText(`Remove selected (${this.selected.size})`);
        rm.disabled = this.selected.size === 0;
      });
      pathButton(tr.createEl('th', { attr: { scope: 'row' } }), this.app, path, short(path));
      tr.createEl('td', { cls: 'vh-muted', text: roles.get(path)?.roles.join(', ') || '—' });
      tr.createEl('td', { text: `${g.internalIn[i]} / ${g.internalOut[i]}` });
      tr.createEl('td', { text: `${g.externalOut[i]} / ${g.externalIn[i]}` });
      tr.createEl('td', { text: g.clusterOf[i] === -1 ? 'unconnected' : `#${(g.clusterOf[i] as number) + 1}` });
      tr.createEl('td', { text: String(this.ctl.state!.issuesByPath.get(path) || '—') });
      tr.createEl('td').createEl('button', { text: 'Remove', attr: { 'aria-label': `Remove ${short(path)} from workspace (the note is not changed)` } })
        .addEventListener('click', () => this.ctl.removeFromWorkspace(id, [path]));
    }
    if (idx.length > 500) body.createEl('p', { cls: 'vh-muted', text: `Showing the first 500 of ${idx.length}.` });
  }

  private renderGraph(body: HTMLElement, a: WorkspaceAnalysis): void {
    const g = a.graph;
    if (g.members.length === 0) return void empty(body, 'Nothing to draw', 'Add existing notes to this workspace.');
    body.createEl('p', { cls: 'vh-muted', text: 'Only the workspace notes and the links between them. Larger circles have more internal connections; hollow circles have none. Click a note to open it.' });
    this.graphCache = getLayout(g, this.graphCache);
    renderLocalGraph(body, this.app, g, this.graphCache, this.focusCluster);

    body.createEl('h3', { text: `Connected groups (${g.clusters.length})` });
    if (g.clusters.length === 0) body.createEl('p', { cls: 'vh-muted', text: 'No two notes in this workspace link to each other yet.' });
    const list = body.createEl('ul', { cls: 'vh-items' });
    for (const c of g.clusters) {
      const li = list.createEl('li', { cls: 'vh-item' });
      const head = li.createDiv({ cls: 'vh-item-head' });
      const b = head.createEl('button', { cls: `vh-link${this.focusCluster === c.id ? ' is-focus' : ''}`, text: `Group ${c.id + 1}: ${c.members.length} notes around “${short(g.members[c.hub] as string)}”`, attr: { 'aria-pressed': String(this.focusCluster === c.id) } });
      b.addEventListener('click', () => { this.focusCluster = this.focusCluster === c.id ? null : c.id; this.render(); });
      li.createDiv({ cls: 'vh-reason', text: `${c.connections} internal connection${c.connections === 1 ? '' : 's'}` });
      const names = li.createDiv({ cls: 'vh-neighbours' });
      c.members.slice(0, 10).forEach((m) => pathButton(names, this.app, g.members[m] as string, short(g.members[m] as string)));
      if (c.members.length > 10) names.createSpan({ cls: 'vh-muted', text: ` +${c.members.length - 10} more` });
    }
    if (g.isolated.length) {
      body.createEl('h3', { text: `Not connected to the rest of the workspace (${g.isolated.length})` });
      const names = body.createDiv({ cls: 'vh-neighbours' });
      g.isolated.forEach((m) => pathButton(names, this.app, g.members[m] as string, short(g.members[m] as string)));
    }
  }

  private renderConnected(body: HTMLElement, id: string, a: WorkspaceAnalysis): void {
    if (a.scope.members.length === 0) return void empty(body, 'Add a few notes first', 'Connected notes are found from the links of the notes already in the workspace.');
    const st = this.ctl.state!;
    body.createEl('p', { cls: 'vh-muted', text: 'Notes outside this workspace that link to or from its notes. Based on links only. Broadly linked notes (indexes, hubs) connect to everything and are flagged. Adding stores a reference; nothing is changed.' });
    const bar = body.createDiv({ cls: 'vh-tools' });
    const sel = bar.createEl('select', { attr: { 'aria-label': 'Minimum connections' } });
    for (const n of [1, 2, 3, 5]) {
      const o = sel.createEl('option', { text: n === 1 ? 'Any connection' : `Connected to ${n}+ notes`, attr: { value: String(n) } });
      if (this.minConnections === n) o.selected = true;
    }
    sel.addEventListener('change', () => { this.minConnections = Number(sel.value); this.render(); });
    const cands = connectedFor(st.analysis.ctx, a, this.minConnections);
    const add = bar.createEl('button', { cls: 'mod-cta', text: `Add selected (${this.pickedCandidates.size})` });
    add.disabled = this.pickedCandidates.size === 0;
    add.addEventListener('click', () => {
      const n = this.ctl.addToWorkspace(id, [...this.pickedCandidates]);
      this.pickedCandidates.clear();
      new Notice(`Added ${n} note reference${n === 1 ? '' : 's'}.`);
    });
    bar.createEl('button', { text: 'Select all shown' }).addEventListener('click', () => {
      cands.slice(0, 200).forEach((c) => this.pickedCandidates.add(c.path));
      this.render();
    });
    if (cands.length === 0) return void empty(body, 'No connected notes found', 'No note outside the workspace links to or from it at this threshold.');
    body.createEl('p', { cls: 'vh-muted', text: `${cands.length} candidate${cands.length === 1 ? '' : 's'}${cands.length > 200 ? ' (showing the first 200)' : ''}` });
    const ul = body.createEl('ul', { cls: 'vh-items' });
    for (const c of cands.slice(0, 200)) {
      const li = ul.createEl('li', { cls: 'vh-item' });
      const head = li.createDiv({ cls: 'vh-item-head' });
      const box = head.createEl('input', { type: 'checkbox', attr: { 'aria-label': `Select ${c.title}` } });
      box.checked = this.pickedCandidates.has(c.path);
      box.addEventListener('change', () => {
        if (box.checked) this.pickedCandidates.add(c.path);
        else this.pickedCandidates.delete(c.path);
        add.setText(`Add selected (${this.pickedCandidates.size})`);
        add.disabled = this.pickedCandidates.size === 0;
      });
      pathButton(head, this.app, c.path, c.title);
      head.createSpan({ cls: 'vh-badge', text: `${c.connections} connection${c.connections === 1 ? '' : 's'}` });
      if (c.specificity < 0.2 && c.degree >= 10) head.createSpan({ cls: 'vh-badge vh-badge-quiet', text: `broadly linked (${c.degree})` });
      const why: string[] = [];
      if (c.linkedFromMembers.length) why.push(`linked from ${c.linkedFromMembers.slice(0, 3).map(short).join(', ')}${c.linkedFromMembers.length > 3 ? ` +${c.linkedFromMembers.length - 3}` : ''}`);
      if (c.linksToMembers.length) why.push(`links to ${c.linksToMembers.slice(0, 3).map(short).join(', ')}${c.linksToMembers.length > 3 ? ` +${c.linksToMembers.length - 3}` : ''}`);
      li.createDiv({ cls: 'vh-reason', text: why.join(' · ') });
      const row = li.createDiv({ cls: 'vh-actions' });
      row.createEl('button', { text: 'Add to workspace' }).addEventListener('click', () => this.ctl.addToWorkspace(id, [c.path]));
      row.createEl('button', { text: 'Open' }).addEventListener('click', () => openPath(this.app, c.path));
    }
  }

  private renderSources(body: HTMLElement, id: string, a: WorkspaceAnalysis): void {
    const ctx = this.ctl.state!.analysis.ctx;
    if (ctx.research.length + ctx.sources.length === 0) {
      return void empty(body, 'No research conventions matched', 'Sources are recognized through your research conventions (Settings → Vault Health → Research conventions).');
    }
    const s = a.sources;
    renderCoverage(body, s.rows.stats, 'this workspace');
    body.createEl('h3', { text: `Research notes in this workspace (${s.rows.notes.length})` });
    renderNoteTable(body, this.app, s.rows.notes, { filter: this.noteFilter, onFilter: (f) => { this.noteFilter = f; this.render(); } });
    body.createEl('h3', { text: `Sources associated with this workspace (${s.sources.length})` });
    body.createEl('p', { cls: 'vh-muted', text: 'Source notes that are members, or that member notes cite.' });
    const byPath = new Map(s.sources.map((x) => [x.path, x]));
    renderSourceTable(body, this.app, s.sources, {
      extraHeader: 'Workspace',
      extra: (td, row) => {
        const w = byPath.get(row.path);
        if (!w) return;
        if (w.inWorkspace) td.createSpan({ cls: 'vh-badge', text: 'In workspace' });
        else td.createEl('button', { text: 'Add' }).addEventListener('click', () => this.ctl.addToWorkspace(id, [row.path]));
        if (w.citedByMembers.length) td.createDiv({ cls: 'vh-muted', text: `cited by ${w.citedByMembers.slice(0, 2).map(short).join(', ')}${w.citedByMembers.length > 2 ? ` +${w.citedByMembers.length - 2}` : ''}` });
      },
    });
  }

  private renderDiagnostics(body: HTMLElement, a: WorkspaceAnalysis): void {
    const st = this.ctl.state!;
    body.createEl('p', { cls: 'vh-muted', text: 'Workspace-level observations first, then the vault-wide findings that touch these notes. Ignore and Mark reviewed apply only to this workspace for workspace-level findings.' });
    const own = rankFindings(a.outputs, this.ctl.registry, this.ctl.settings.scoring).filter((r) => r.open.length > 0);
    const filter = memberItemFilter(a.scope);
    const vault = st.ranked.filter((r) => r.open.some(filter));
    if (own.length + vault.length === 0) return void empty(body, 'No open findings for this workspace', 'Nothing was flagged for these notes by the enabled checks.');
    if (own.length) {
      body.createEl('h3', { text: 'This workspace as a whole' });
      for (const r of own) renderFinding(body, this.ctl, this.app, r, { openSet: this.openFindings });
    }
    if (vault.length) {
      body.createEl('h3', { text: 'Findings in its notes' });
      for (const r of vault) renderFinding(body, this.ctl, this.app, r, { openSet: this.openFindings, filter });
    }
  }
}
