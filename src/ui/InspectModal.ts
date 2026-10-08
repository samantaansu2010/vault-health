import { Modal, type App } from 'obsidian';
import type { HealthController } from '../controller.ts';
import type { FindingItem } from '../model/types.ts';
import type { RankedFinding } from '../scoring/priority.ts';
import { openPath, pathButton, renderEvidence, SEVERITY_LABEL } from './common.ts';

/** Read-only explanation of one finding: reason, evidence, and the link neighbourhood of each affected file. */
export class InspectModal extends Modal {
  private ctl: HealthController;
  private r: RankedFinding;
  private item: FindingItem;

  constructor(app: App, ctl: HealthController, r: RankedFinding, item: FindingItem) {
    super(app);
    this.ctl = ctl;
    this.r = r;
    this.item = item;
  }

  override onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(this.r.finding.title);
    contentEl.addClass('vh-modal');
    contentEl.createEl('p', { cls: 'vh-muted', text: `${SEVERITY_LABEL[this.item.severity ?? this.r.finding.severity]} · ${this.r.finding.tier} · ${this.r.finding.dimension}` });
    contentEl.createEl('h4', { text: 'Why this was flagged' });
    contentEl.createEl('p', { text: this.item.reason });
    contentEl.createEl('p', { cls: 'vh-muted', text: this.r.finding.description });
    contentEl.createEl('h4', { text: 'Evidence' });
    renderEvidence(contentEl, this.app, this.item.evidence);

    const g = this.ctl.state?.analysis.ctx.graph;
    const byPath = this.ctl.state?.analysis.ctx.byPath;
    for (const p of this.item.paths.slice(0, 5)) {
      contentEl.createEl('h4', { text: p });
      const row = contentEl.createDiv({ cls: 'vh-actions' });
      row.createEl('button', { text: 'Open' }).addEventListener('click', () => openPath(this.app, p));
      const note = byPath?.get(p);
      if (note) {
        const meta = [note.roles.length ? `roles: ${note.roles.join(', ')}` : '', note.tags.length ? `tags: ${note.tags.map((t) => '#' + t).join(' ')}` : '']
          .filter(Boolean).join(' · ');
        if (meta) contentEl.createEl('p', { cls: 'vh-muted', text: meta });
      }
      const i = g?.index.get(p);
      if (g && i !== undefined) {
        this.neighbours('Links to', (g.out[i] as number[]).map((j) => g.paths[j] as string));
        this.neighbours('Linked from', (g.inn[i] as number[]).map((j) => g.paths[j] as string));
      }
    }
    if (this.item.paths.length > 5) contentEl.createEl('p', { cls: 'vh-muted', text: `+${this.item.paths.length - 5} more files not shown` });
    contentEl.createEl('p', { cls: 'vh-suggestion', text: this.r.finding.suggestion });
  }

  private neighbours(label: string, paths: string[]): void {
    const d = this.contentEl.createDiv({ cls: 'vh-neighbours' });
    d.createSpan({ cls: 'vh-muted', text: `${label} (${paths.length}): ` });
    if (paths.length === 0) d.createSpan({ text: 'none' });
    for (const p of paths.slice(0, 12)) pathButton(d, this.app, p, p.replace(/\.md$/, '').split('/').pop());
    if (paths.length > 12) d.createSpan({ cls: 'vh-muted', text: ` +${paths.length - 12} more` });
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
