import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { ART_FIELD_LABEL, type FacetCount } from '../analysis/art/artworks.ts';
import type { HealthController } from '../controller.ts';
import type { ArtField } from '../model/settings.ts';
import { empty, renderFinding } from './common.ts';

export const ART_VIEW = 'vault-health-art';

/**
 * Art & Media: the state of your artwork records. Everything is read from your own properties through a
 * configurable field mapping; the plugin supplies no art-historical knowledge and never infers metadata.
 */
export class ArtView extends ItemView {
  private ctl: HealthController;
  private unsub: (() => void) | null = null;
  private openFindings = new Set<string>();

  constructor(leaf: WorkspaceLeaf, ctl: HealthController) {
    super(leaf);
    this.ctl = ctl;
  }

  getViewType(): string { return ART_VIEW; }
  getDisplayText(): string { return 'Art & Media'; }
  override getIcon(): string { return 'palette'; }

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
    header.createEl('h2', { text: 'Art & Media' });
    header.createEl('p', { cls: 'vh-muted', text: 'The state of your artwork records and visual assets, read from your own properties. Nothing is inferred and nothing is changed.' });
    const st = this.ctl.state;
    if (!st) return void empty(root, this.ctl.running ? 'Scanning…' : 'No scan yet', 'The collection overview appears when the first scan finishes.');

    const art = st.analysis.art;
    const cfg = this.ctl.settings.analysis.art;
    if (!this.ctl.settings.analysis.modules.art) return void empty(root, 'Art & Media checks are off', 'Turn them on in Settings → Vault Health → Checks.');
    if (art.artworks.length === 0) {
      return void empty(root, 'No artwork records matched',
        'Mark artwork notes with the property type: artwork or the tag #artwork, or edit the “artwork” role in Settings → Vault Health → Research conventions (any properties, tags or folders work). Media health below still applies to the whole vault.');
    }

    const n = art.artworks.length;
    const box = root.createDiv({ cls: 'vh-coverage' });
    box.createEl('strong', { text: `${n.toLocaleString()} artwork record${n === 1 ? '' : 's'}` });
    const chain = box.createDiv({ cls: 'vh-chain' });
    const cell = (num: number, label: string) => {
      const c = chain.createDiv({ cls: 'vh-chaincell' });
      c.createDiv({ cls: 'vh-chainnum', text: num.toLocaleString() });
      c.createDiv({ cls: 'vh-muted', text: label });
    };
    cell(art.facets.artist.length, 'artists');
    cell(art.facets.movement.length, 'movements');
    cell(art.facets.period.length, 'periods');
    cell(art.facets.medium.length, 'mediums');
    const years = art.artworks.map((a) => a.year?.year).filter((y): y is number => y !== undefined);
    if (years.length) {
      box.createEl('p', {
        cls: 'vh-muted',
        text: `${years.length} of ${n} are dated (${Math.min(...years)}–${Math.max(...years)}); approximate dates such as “c. 1937” and decades are included as written.`,
      });
    }

    root.createEl('h3', { text: 'Missing metadata' });
    const wrap = root.createDiv({ cls: 'vh-tablewrap' });
    const t = wrap.createEl('table', { cls: 'vh-table' });
    const head = t.createEl('thead').createEl('tr');
    for (const h of ['Field', 'Missing', 'Share', 'Properties read']) head.createEl('th', { text: h, attr: { scope: 'col' } });
    const tb = t.createEl('tbody');
    for (const f of Object.keys(cfg.fields) as ArtField[]) {
      const tr = tb.createEl('tr');
      const th = tr.createEl('th', { attr: { scope: 'row' }, text: ART_FIELD_LABEL[f] });
      if (!cfg.required.includes(f)) th.createSpan({ cls: 'vh-badge vh-badge-quiet', text: 'optional' });
      tr.createEl('td', { text: String(art.missing[f]) });
      tr.createEl('td', { text: `${((art.missing[f] / n) * 100).toFixed(0)}%` });
      tr.createEl('td', { cls: 'vh-muted', text: cfg.fields[f].join(', ') });
    }

    root.createEl('h3', { text: 'Collection facets' });
    const facets = root.createDiv({ cls: 'vh-split' });
    const facet = (title: string, list: FacetCount[]) => {
      const d = facets.createDiv({ cls: 'vh-areamain' });
      d.createEl('h4', { text: `${title} (${list.length})` });
      if (list.length === 0) return void d.createEl('p', { cls: 'vh-muted', text: 'None recorded.' });
      const ul = d.createEl('ul');
      for (const f of list.slice(0, 8)) ul.createEl('li', { text: `${f.value}: ${f.count}` });
      if (list.length > 8) d.createEl('p', { cls: 'vh-muted', text: `+${list.length - 8} more` });
    };
    facet('Artists', art.facets.artist);
    facet('Movements', art.facets.movement);
    facet('Periods', art.facets.period);
    facet('Mediums', art.facets.medium);

    root.createEl('h3', { text: 'Findings' });
    const ranked = st.ranked.filter((r) => r.finding.ruleId.startsWith('art.') || r.finding.ruleId.startsWith('visual.'));
    let any = false;
    for (const r of ranked) {
      if (r.open.length === 0) continue;
      any = true;
      renderFinding(root, this.ctl, this.app, r, { openSet: this.openFindings });
    }
    if (!any) empty(root, 'No open findings', 'Artwork records and media look consistent under the enabled checks.');
  }
}
