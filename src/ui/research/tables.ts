import type { App } from 'obsidian';
import type { ProvenanceStatus } from '../../analysis/research/provenance.ts';
import type { ResearchNoteRow, ResearchStats, SourceRow } from '../../analysis/research/rows.ts';
import { empty, pathButton } from '../common.ts';

export const STATUS_LABEL: Record<ProvenanceStatus, string> = {
  sourced: 'Sourced',
  'broken-only': 'Source link broken',
  'citation-only': 'Citations, no source record',
  unsourced: 'No source found',
};

const short = (p: string) => p.replace(/\.md$/, '').split('/').pop() ?? p;

/** Shared by the automatic research analysis and by user-created workspaces. */
export function renderCoverage(root: HTMLElement, t: ResearchStats, scopeLabel: string): void {
  const box = root.createDiv({ cls: 'vh-coverage' });
  const pct = t.researchNotes ? Math.round((t.sourced / t.researchNotes) * 100) : 0;
  box.createEl('strong', { text: 'Source coverage' });
  box.createEl('p', {
    text: t.researchNotes
      ? `${t.sourced} of ${t.researchNotes} research notes (${pct}%) in ${scopeLabel} have a recorded source.`
      : `No research notes in ${scopeLabel}.`,
  });
  const chain = box.createDiv({ cls: 'vh-chain', attr: { 'aria-label': 'Provenance summary' } });
  const cell = (n: number, label: string) => {
    const c = chain.createDiv({ cls: 'vh-chaincell' });
    c.createDiv({ cls: 'vh-chainnum', text: String(n) });
    c.createDiv({ cls: 'vh-muted', text: label });
  };
  cell(t.sources, 'source notes');
  cell(t.unreferencedSources, 'never cited by research');
  cell(t.researchNotes, 'research notes');
  cell(t.sourced, 'sourced');
  cell(t.citationOnly, 'citations only');
  cell(t.brokenOnly, 'broken source link');
  cell(t.unsourced, 'no source found');
}

export interface NoteTableOptions {
  filter: 'all' | ProvenanceStatus;
  onFilter: (f: 'all' | ProvenanceStatus) => void;
}

export function renderNoteTable(main: HTMLElement, app: App, rows: ResearchNoteRow[], opts: NoteTableOptions): void {
  const bar = main.createDiv({ cls: 'vh-tools' });
  const sel = bar.createEl('select', { attr: { 'aria-label': 'Filter by provenance status' } });
  sel.createEl('option', { text: 'All statuses', attr: { value: 'all' } });
  for (const [k, v] of Object.entries(STATUS_LABEL)) {
    const o = sel.createEl('option', { text: v, attr: { value: k } });
    if (opts.filter === k) o.selected = true;
  }
  sel.addEventListener('change', () => opts.onFilter(sel.value as 'all' | ProvenanceStatus));
  const shown = rows.filter((r) => opts.filter === 'all' || r.status === opts.filter);
  if (shown.length === 0) return void empty(main, 'Nothing here', 'No research notes match the filter.');
  const t = main.createDiv({ cls: 'vh-tablewrap' }).createEl('table', { cls: 'vh-table' });
  const head = t.createEl('thead').createEl('tr');
  for (const h of ['Note', 'Provenance', 'Sources', 'Links in / out', 'Issues']) head.createEl('th', { text: h, attr: { scope: 'col' } });
  const tb = t.createEl('tbody');
  for (const r of shown.slice(0, 200)) {
    const tr = tb.createEl('tr');
    pathButton(tr.createEl('th', { attr: { scope: 'row' } }), app, r.path, r.title);
    const s = tr.createEl('td');
    s.createSpan({ cls: `vh-badge vh-prov-${r.status}`, text: STATUS_LABEL[r.status] });
    if (r.status === 'citation-only') s.createDiv({ cls: 'vh-muted', text: `${r.signals.urls} URL · ${r.signals.footnotes} footnote · ${r.signals.citekeys} key` });
    const src = tr.createEl('td');
    r.sources.slice(0, 3).forEach((p) => pathButton(src, app, p, short(p)));
    if (r.sources.length > 3) src.createSpan({ cls: 'vh-muted', text: ` +${r.sources.length - 3}` });
    r.brokenSources.slice(0, 2).forEach((b) => src.createSpan({ cls: 'vh-broken', text: `✕ ${b}` }));
    if (r.sources.length === 0 && r.brokenSources.length === 0) src.setText('—');
    tr.createEl('td', { text: `${r.inbound} / ${r.outbound}` });
    tr.createEl('td', { text: r.issues ? String(r.issues) : '—' });
  }
  if (shown.length > 200) main.createEl('p', { cls: 'vh-muted', text: `Showing the first 200 of ${shown.length}. Narrow with the filter.` });
}

export interface SourceTableOptions {
  /** Extra per-row cell (e.g. workspace membership + an "Add to workspace" button). */
  extra?: (td: HTMLElement, row: SourceRow) => void;
  extraHeader?: string;
}

export function renderSourceTable(main: HTMLElement, app: App, rows: SourceRow[], opts: SourceTableOptions = {}): void {
  if (rows.length === 0) return void empty(main, 'No source notes here', 'No notes with the source role were found for this scope.');
  const t = main.createDiv({ cls: 'vh-tablewrap' }).createEl('table', { cls: 'vh-table' });
  const head = t.createEl('thead').createEl('tr');
  const headers = ['Source', 'Cited by research notes', 'Identifiers', 'Issues', ...(opts.extra ? [opts.extraHeader ?? ''] : [])];
  for (const h of headers) head.createEl('th', { text: h, attr: { scope: 'col' } });
  const tb = t.createEl('tbody');
  for (const s of rows.slice(0, 200)) {
    const tr = tb.createEl('tr');
    pathButton(tr.createEl('th', { attr: { scope: 'row' } }), app, s.path, s.title);
    const c = tr.createEl('td');
    if (s.referencedBy.length === 0) c.createSpan({ cls: 'vh-badge vh-prov-unsourced', text: s.otherInbound ? 'Only non-research links' : 'Never referenced' });
    s.referencedBy.slice(0, 3).forEach((p) => pathButton(c, app, p, short(p)));
    if (s.referencedBy.length > 3) c.createSpan({ cls: 'vh-muted', text: ` +${s.referencedBy.length - 3}` });
    const id = tr.createEl('td');
    if (s.identity.length === 0) id.createSpan({ cls: 'vh-muted', text: 'none' });
    s.identity.slice(0, 2).forEach((x) => id.createDiv({ text: x }));
    if (s.missing.length) id.createDiv({ cls: 'vh-broken', text: `missing ${s.missing.join('; ')}` });
    tr.createEl('td', { text: s.issues ? String(s.issues) : '—' });
    if (opts.extra) opts.extra(tr.createEl('td'), s);
  }
  if (rows.length > 200) main.createEl('p', { cls: 'vh-muted', text: `Showing the first 200 of ${rows.length}.` });
}
