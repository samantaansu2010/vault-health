import { Modal, type App } from 'obsidian';
import type { HealthController } from '../controller.ts';
import { pathButton } from './common.ts';

/** Everything the user has chosen to ignore, with one-click restore. Nothing is ever hidden permanently. */
export class IgnoredModal extends Modal {
  private ctl: HealthController;

  constructor(app: App, ctl: HealthController) {
    super(app);
    this.ctl = ctl;
  }

  override onOpen(): void {
    this.titleEl.setText('Ignored findings');
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('vh-modal');
    const items = this.ctl.registry.ignoredStates();
    contentEl.createEl('p', { cls: 'vh-muted', text: 'Ignored findings are treated as accepted and excluded from scores. Restoring one makes it count again.' });
    if (items.length === 0) {
      contentEl.createEl('p', { text: 'Nothing is ignored.' });
      return;
    }
    const ul = contentEl.createEl('ul', { cls: 'vh-items' });
    for (const [id, st] of items) {
      const li = ul.createEl('li', { cls: 'vh-item' });
      const head = li.createDiv({ cls: 'vh-item-head' });
      head.createSpan({ cls: 'vh-badge vh-badge-quiet', text: st.ruleId });
      for (const p of st.paths.slice(0, 3)) pathButton(head, this.app, p);
      if (st.note) li.createDiv({ cls: 'vh-reason', text: st.note });
      const actions = li.createDiv({ cls: 'vh-actions' });
      actions.createEl('button', { text: 'Restore' }).addEventListener('click', () => {
        this.ctl.restore(id);
        this.render();
      });
    }
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
