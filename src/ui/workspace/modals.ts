import { Modal, Notice, type App } from 'obsidian';
import type { HealthController } from '../../controller.ts';
import { WorkspaceError } from '../../workspace/model/types.ts';

const message = (e: unknown) => (e instanceof WorkspaceError ? e.message : e instanceof Error ? e.message : String(e));

/** Single-line text prompt. `onSubmit` throws to show an inline error and keep the dialog open. */
export class PromptModal extends Modal {
  private titleText: string;
  private label: string;
  private initial: string;
  private cta: string;
  private onSubmit: (value: string) => void;

  constructor(app: App, opts: { title: string; label: string; initial?: string; cta: string; onSubmit: (value: string) => void }) {
    super(app);
    this.titleText = opts.title;
    this.label = opts.label;
    this.initial = opts.initial ?? '';
    this.cta = opts.cta;
    this.onSubmit = opts.onSubmit;
  }

  override onOpen(): void {
    this.titleEl.setText(this.titleText);
    const { contentEl } = this;
    contentEl.addClass('vh-modal');
    const id = 'vh-prompt-input';
    contentEl.createEl('label', { text: this.label, attr: { for: id } });
    const input = contentEl.createEl('input', { type: 'text', value: this.initial, attr: { id, maxlength: '80' } });
    input.addClass('vh-prompt');
    const err = contentEl.createDiv({ cls: 'vh-error vh-hidden', attr: { role: 'alert' } });
    const go = () => {
      try {
        this.onSubmit(input.value);
        this.close();
      } catch (e) {
        err.removeClass('vh-hidden');
        err.setText(message(e));
      }
    };
    const row = contentEl.createDiv({ cls: 'vh-actions' });
    row.createEl('button', { text: this.cta, cls: 'mod-cta' }).addEventListener('click', go);
    row.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    window.setTimeout(() => { input.focus(); input.select(); }, 0);
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}

export class ConfirmModal extends Modal {
  private titleText: string;
  private body: string;
  private cta: string;
  private onConfirm: () => void;

  constructor(app: App, opts: { title: string; body: string; cta: string; onConfirm: () => void }) {
    super(app);
    this.titleText = opts.title;
    this.body = opts.body;
    this.cta = opts.cta;
    this.onConfirm = opts.onConfirm;
  }

  override onOpen(): void {
    this.titleEl.setText(this.titleText);
    this.contentEl.addClass('vh-modal');
    this.contentEl.createEl('p', { text: this.body });
    const row = this.contentEl.createDiv({ cls: 'vh-actions' });
    const cancel = row.createEl('button', { text: 'Cancel' });
    cancel.addEventListener('click', () => this.close());
    row.createEl('button', { text: this.cta, cls: 'mod-warning' }).addEventListener('click', () => {
      this.onConfirm();
      this.close();
    });
    window.setTimeout(() => cancel.focus(), 0); // the safe choice is focused by default
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}

const PAGE = 100;

/** Search the vault's notes and tick the ones to add. Only references are stored; notes are not changed. */
export class NotePickerModal extends Modal {
  private ctl: HealthController;
  private exclude: ReadonlySet<string>;
  private onAdd: (paths: string[]) => void;
  private chosen = new Set<string>();
  private query = '';

  constructor(app: App, ctl: HealthController, exclude: ReadonlySet<string>, onAdd: (paths: string[]) => void) {
    super(app);
    this.ctl = ctl;
    this.exclude = exclude;
    this.onAdd = onAdd;
  }

  override onOpen(): void {
    this.titleEl.setText('Add existing notes');
    this.contentEl.addClass('vh-modal');
    this.render();
  }

  private render(keepFocus = false): void {
    const { contentEl } = this;
    contentEl.empty();
    const st = this.ctl.state;
    if (!st) {
      contentEl.createEl('p', { text: 'Waiting for the first scan to finish…' });
      return;
    }
    contentEl.createEl('p', { cls: 'vh-muted', text: 'The workspace stores references to these notes. Nothing is copied, moved or edited.' });
    const input = contentEl.createEl('input', { type: 'search', value: this.query, placeholder: 'Search by name, path, tag or alias', attr: { 'aria-label': 'Search notes' } });
    input.addClass('vh-prompt');
    const q = this.query.trim().toLowerCase();
    const all = [...st.analysis.ctx.allByPath.values()].filter((n) => !this.exclude.has(n.path));
    const hits = (q
      ? all.filter((n) => n.path.toLowerCase().includes(q) || n.aliases.some((a) => a.toLowerCase().includes(q)) || n.tags.some((t) => t.includes(q.replace(/^#/, ''))))
      : all
    ).sort((a, b) => a.basename.localeCompare(b.basename));
    contentEl.createEl('p', { cls: 'vh-muted', text: `${hits.length.toLocaleString()} note${hits.length === 1 ? '' : 's'}${hits.length > PAGE ? ` (showing the first ${PAGE}; refine the search)` : ''}` });
    const list = contentEl.createEl('ul', { cls: 'vh-picklist' });
    for (const n of hits.slice(0, PAGE)) {
      const li = list.createEl('li');
      const id = `vh-pick-${list.children.length}`;
      const box = li.createEl('input', { type: 'checkbox', attr: { id } });
      box.checked = this.chosen.has(n.path);
      box.addEventListener('change', () => {
        if (box.checked) this.chosen.add(n.path);
        else this.chosen.delete(n.path);
        updateCta();
      });
      const lab = li.createEl('label', { attr: { for: id } });
      lab.createSpan({ text: n.basename });
      if (n.folder) lab.createSpan({ cls: 'vh-muted', text: `  ${n.folder}` });
    }
    const row = contentEl.createDiv({ cls: 'vh-actions' });
    const cta = row.createEl('button', { cls: 'mod-cta' });
    const updateCta = () => {
      cta.setText(this.chosen.size ? `Add ${this.chosen.size} note${this.chosen.size === 1 ? '' : 's'}` : 'Add');
      cta.disabled = this.chosen.size === 0;
    };
    updateCta();
    cta.addEventListener('click', () => {
      this.onAdd([...this.chosen]);
      this.close();
    });
    const shown = row.createEl('button', { text: 'Select all shown' });
    shown.addEventListener('click', () => {
      hits.slice(0, PAGE).forEach((n) => this.chosen.add(n.path));
      this.render();
    });
    row.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
    input.addEventListener('input', () => {
      this.query = input.value;
      this.render(true);
    });
    if (keepFocus) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    } else window.setTimeout(() => input.focus(), 0);
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}

/** List, open, create, rename and delete workspaces. `choose` mode is used to pick a destination for a note. */
export class WorkspacesModal extends Modal {
  private ctl: HealthController;
  private onPick: (id: string) => void;
  private pickLabel: string;
  private heading: string;

  constructor(app: App, ctl: HealthController, opts: { heading?: string; pickLabel?: string; onPick: (id: string) => void }) {
    super(app);
    this.ctl = ctl;
    this.onPick = opts.onPick;
    this.pickLabel = opts.pickLabel ?? 'Open';
    this.heading = opts.heading ?? 'Research workspaces';
  }

  override onOpen(): void {
    this.titleEl.setText(this.heading);
    this.contentEl.addClass('vh-modal');
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('p', { cls: 'vh-muted', text: 'A workspace is a named set of references to notes in your vault. Closing or deleting a workspace never changes your notes.' });
    const top = contentEl.createDiv({ cls: 'vh-actions' });
    top.createEl('button', { text: 'New workspace…', cls: 'mod-cta' }).addEventListener('click', () => {
      new PromptModal(this.app, {
        title: 'New research workspace', label: 'Name', cta: 'Create',
        onSubmit: (name) => {
          const w = this.ctl.createWorkspace(name);
          this.onPick(w.id);
          this.close();
        },
      }).open();
    });
    const items = this.ctl.workspaces.list();
    if (items.length === 0) {
      contentEl.createEl('p', { text: 'No workspaces yet. Create one, then add the notes that belong to that topic.' });
      return;
    }
    const ul = contentEl.createEl('ul', { cls: 'vh-items' });
    for (const w of items) {
      const li = ul.createEl('li', { cls: 'vh-item' });
      const head = li.createDiv({ cls: 'vh-item-head' });
      head.createEl('strong', { text: w.name });
      head.createSpan({ cls: 'vh-muted', text: `${w.notes.length} note${w.notes.length === 1 ? '' : 's'}` });
      const row = li.createDiv({ cls: 'vh-actions' });
      row.createEl('button', { text: this.pickLabel }).addEventListener('click', () => {
        this.onPick(w.id);
        this.close();
      });
      row.createEl('button', { text: 'Rename…' }).addEventListener('click', () => {
        new PromptModal(this.app, {
          title: 'Rename workspace', label: 'Name', initial: w.name, cta: 'Rename',
          onSubmit: (name) => { this.ctl.renameWorkspace(w.id, name); this.render(); },
        }).open();
      });
      row.createEl('button', { text: 'Delete…' }).addEventListener('click', () => {
        new ConfirmModal(this.app, {
          title: `Delete “${w.name}”?`,
          body: `This deletes only the workspace (its name and its list of ${w.notes.length} note reference${w.notes.length === 1 ? '' : 's'}). The notes themselves are not touched.`,
          cta: 'Delete workspace',
          onConfirm: () => { this.ctl.deleteWorkspace(w.id); new Notice(`Deleted workspace “${w.name}”. Your notes were not changed.`); this.render(); },
        }).open();
      });
    }
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
