import { TFile, type App } from 'obsidian';
import type { RankedFinding } from '../scoring/priority.ts';
import type { HealthController } from '../controller.ts';
import type { Evidence, FindingItem, Severity } from '../model/types.ts';
import { InspectModal } from './InspectModal.ts';

export const SEVERITY_LABEL: Record<Severity, string> = { high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };
export const PAGE = 40;

export function openPath(app: App, path: string, newTab = false): void {
  const f = app.vault.getAbstractFileByPath(path);
  if (f instanceof TFile) void app.workspace.getLeaf(newTab ? 'tab' : false).openFile(f);
}

/** A real <button> styled as a link: keyboard-focusable, Enter/Space activate. */
export function pathButton(parent: HTMLElement, app: App, path: string, label?: string): HTMLButtonElement {
  const b = parent.createEl('button', { cls: 'vh-link', text: label ?? path, attr: { 'aria-label': `Open ${path}`, title: path } });
  b.addEventListener('click', (e) => openPath(app, path, e.ctrlKey || e.metaKey));
  return b;
}

export function renderEvidence(parent: HTMLElement, app: App, evidence: Evidence[]): void {
  if (evidence.length === 0) return;
  const dl = parent.createEl('dl', { cls: 'vh-evidence' });
  for (const e of evidence) {
    dl.createEl('dt', { text: e.label });
    const dd = dl.createEl('dd');
    if (e.path) pathButton(dd, app, e.path, String(e.value));
    else dd.setText(String(e.value));
  }
}

export function fmtScore(score: number | null): string {
  return score === null ? '—' : String(Math.round(score));
}

export function scoreClass(score: number | null): string {
  if (score === null) return 'vh-score-none';
  return score >= 80 ? 'vh-score-good' : score >= 55 ? 'vh-score-ok' : 'vh-score-low';
}

export function empty(parent: HTMLElement, title: string, body: string): void {
  const d = parent.createDiv({ cls: 'vh-empty' });
  d.createEl('strong', { text: title });
  d.createEl('p', { text: body });
}

export interface FindingRenderOptions {
  filter?: (item: FindingItem) => boolean;
  openSet: Set<string>;
}

/** One finding group: why it matters, then each affected item with its reason, evidence and actions. */
export function renderFinding(parent: HTMLElement, ctl: HealthController, app: App, r: RankedFinding, opts: FindingRenderOptions): void {
  const open = opts.filter ? r.open.filter(opts.filter) : r.open;
  if (open.length === 0) return;
  const key = r.finding.ruleId;
  const det = parent.createEl('details', { cls: `vh-finding vh-sev-${r.severity}` });
  if (opts.openSet.has(key)) det.setAttr('open', '');
  det.addEventListener('toggle', () => {
    if (det.open) opts.openSet.add(key);
    else opts.openSet.delete(key);
  });
  const sum = det.createEl('summary');
  sum.createSpan({ cls: 'vh-badge', text: SEVERITY_LABEL[r.severity] });
  sum.createSpan({ cls: 'vh-finding-title', text: r.finding.title });
  sum.createSpan({ cls: 'vh-count', text: String(open.length) });
  const body = det.createDiv({ cls: 'vh-finding-body' });
  body.createEl('p', { cls: 'vh-muted', text: r.finding.description });
  body.createEl('p', { cls: 'vh-suggestion', text: r.finding.suggestion });

  const list = body.createEl('ul', { cls: 'vh-items' });
  let shown = 0;
  const more = body.createEl('button', { cls: 'vh-more' });
  const renderMore = () => {
    for (const item of open.slice(shown, shown + PAGE)) renderItem(list, ctl, app, r, item);
    shown = Math.min(open.length, shown + PAGE);
    if (shown >= open.length) more.remove();
    else more.setText(`Show ${Math.min(PAGE, open.length - shown)} more (${open.length - shown} remaining)`);
  };
  more.addEventListener('click', renderMore);
  renderMore();
}

function renderItem(list: HTMLElement, ctl: HealthController, app: App, r: RankedFinding, item: FindingItem): void {
  const status = ctl.registry.statusOf(item.id);
  const li = list.createEl('li', { cls: `vh-item${status === 'reviewed' ? ' vh-reviewed' : ''}` });
  const head = li.createDiv({ cls: 'vh-item-head' });
  const shownPaths = item.paths.slice(0, 3);
  for (const p of shownPaths) pathButton(head, app, p);
  if (item.paths.length > shownPaths.length) head.createSpan({ cls: 'vh-muted', text: ` +${item.paths.length - shownPaths.length} more` });
  if (status === 'reviewed') head.createSpan({ cls: 'vh-badge vh-badge-quiet', text: 'Reviewed' });
  li.createDiv({ cls: 'vh-reason', text: item.reason });

  const actions = li.createDiv({ cls: 'vh-actions' });
  const btn = (label: string, fn: () => void, hint: string) => {
    const b = actions.createEl('button', { text: label, attr: { 'aria-label': `${label}: ${item.paths[0] ?? ''}`, title: hint } });
    b.addEventListener('click', fn);
  };
  btn('Open', () => openPath(app, item.paths[0] as string), 'Open the first affected file');
  btn('Inspect', () => new InspectModal(app, ctl, r, item).open(), 'Show why this was flagged, with evidence and links');
  btn('Ignore', () => ctl.ignore(r.finding.ruleId, item), 'Accept this finding. It is excluded from scores; restore it from Ignored.');
  if (status === 'reviewed') btn('Unmark', () => ctl.unreview(item.id), 'Remove the reviewed mark');
  else btn('Mark reviewed', () => ctl.review(r.finding.ruleId, item), 'Record that you looked at this. It stays counted until fixed.');
}
