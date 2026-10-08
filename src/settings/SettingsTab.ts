import { PluginSettingTab, Setting, type App, type Plugin } from 'obsidian';
import { discoverConventions } from '../conventions/discovery.ts';
import { PRESETS, presetById } from '../conventions/presets.ts';
import { validateRoles } from '../conventions/roles.ts';
import type { HealthController } from '../controller.ts';
import type { ConventionSet } from '../model/conventions.ts';
import { METRICS } from '../scoring/metricDefs.ts';

const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export class VaultHealthSettingTab extends PluginSettingTab {
  private ctl: HealthController;

  constructor(app: App, plugin: Plugin, ctl: HealthController) {
    super(app, plugin);
    this.ctl = ctl;
  }

  override display(): void {
    const { containerEl } = this;
    const ctl = this.ctl;
    const s = ctl.settings;
    containerEl.empty();

    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Vault Health is read-only and local: no network requests, no AI, no telemetry. It never edits, moves or deletes your files.',
    });

    new Setting(containerEl).setName('Checks').setHeading();
    const mod = (key: keyof typeof s.analysis.modules, name: string, desc: string) =>
      new Setting(containerEl).setName(name).setDesc(desc).addToggle((t) =>
        t.setValue(s.analysis.modules[key]).onChange((v) => void ctl.updateSettings((x) => { x.analysis.modules[key] = v; }, true)));
    mod('structure', 'Link structure', 'Broken links, orphan notes, isolated clusters.');
    mod('research', 'Research integrity', 'Sources, provenance, research notes and the Research Workspace.');
    mod('media', 'Media and attachments', 'Broken embeds, unreferenced files.');
    mod('art', 'Art & Media', 'Artwork records: missing metadata, image integrity, readable dates.');
    mod('hygiene', 'Housekeeping', 'Singleton tags, oversized and empty notes, dead ends. Low weight.');

    new Setting(containerEl).setName('Research conventions').setHeading();
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Tell Vault Health how you mark research material. Roles can match properties, tags, folders, aliases, file names, or combinations. Nothing is assumed silently: counts below update live.',
    });

    new Setting(containerEl).setName('Preset').setDesc('Replaces the roles below with a starting point you can then edit.').addDropdown((d) => {
      for (const p of PRESETS) d.addOption(p.id, p.label);
      d.setValue(s.analysis.conventions.id);
      d.onChange((id) => {
        void ctl.updateSettings((x) => { x.analysis.conventions = presetById(id); }, true).then(() => this.display());
      });
    });

    this.renderMatchCounts(containerEl);

    let draft = JSON.stringify(slim(s.analysis.conventions), null, 2);
    const errorEl = containerEl.createDiv({ cls: 'vh-error vh-hidden' });
    new Setting(containerEl)
      .setName('Edit conventions (advanced)')
      .setDesc('JSON: roles (match expressions), provenance properties, and required source/research properties. Applied only when valid.')
      .addTextArea((t) => {
        t.setValue(draft).onChange((v) => (draft = v));
        t.inputEl.rows = 16;
        t.inputEl.addClass('vh-json');
      })
      .addButton((b) => b.setButtonText('Apply').setCta().onClick(() => {
        try {
          const parsed = JSON.parse(draft) as Partial<ConventionSet>;
          const err = validateRoles(parsed.roles);
          if (err) throw new Error(err);
          const base = s.analysis.conventions;
          void ctl.updateSettings((x) => {
            x.analysis.conventions = {
              ...base, ...parsed, id: 'custom', label: 'Custom',
              provenance: { ...base.provenance, ...(parsed.provenance ?? {}) },
              sourceRequirement: { ...base.sourceRequirement, ...(parsed.sourceRequirement ?? {}) },
              researchRequirement: { ...base.researchRequirement, ...(parsed.researchRequirement ?? {}) },
            } as ConventionSet;
          }, true).then(() => this.display());
        } catch (e) {
          errorEl.removeClass('vh-hidden');
          errorEl.setText(`Not applied: ${e instanceof Error ? e.message : String(e)}`);
        }
      }));

    this.renderDiscovery(containerEl);

    new Setting(containerEl).setName('Art & Media fields').setHeading();
    let artDraft = JSON.stringify(s.analysis.art, null, 2);
    const artErr = containerEl.createDiv({ cls: 'vh-error vh-hidden' });
    new Setting(containerEl)
      .setName('Artwork field mapping')
      .setDesc('Which properties hold each field (first one set wins), and which fields to report as missing. Artwork records are the notes matching the “artwork” role above.')
      .addTextArea((t) => { t.setValue(artDraft).onChange((v) => (artDraft = v)); t.inputEl.rows = 14; t.inputEl.addClass('vh-json'); })
      .addButton((b) => b.setButtonText('Apply').onClick(() => {
        try {
          const p = JSON.parse(artDraft) as Partial<typeof s.analysis.art>;
          const known = ['artist', 'year', 'medium', 'movement', 'period', 'source', 'image'];
          for (const k of Object.keys(p.fields ?? {})) if (!known.includes(k)) throw new Error(`unknown field "${k}"`);
          for (const r of p.required ?? []) if (!known.includes(r)) throw new Error(`unknown required field "${r}"`);
          void ctl.updateSettings((x) => { x.analysis.art = { fields: { ...x.analysis.art.fields, ...(p.fields ?? {}) }, required: p.required ?? x.analysis.art.required }; }, true).then(() => this.display());
        } catch (e) {
          artErr.removeClass('vh-hidden');
          artErr.setText(`Not applied: ${e instanceof Error ? e.message : String(e)}`);
        }
      }));

    new Setting(containerEl).setName('Exclusions').setHeading();
    new Setting(containerEl).setName('Excluded folders').setDesc('Comma-separated. Notes here are not analyzed (but still count as references for attachments).')
      .addText((t) => t.setValue(s.analysis.excludeFolders.join(', ')).onChange((v) => void ctl.updateSettings((x) => { x.analysis.excludeFolders = csv(v); }, true)));
    new Setting(containerEl).setName('Excluded tags').setDesc('Comma-separated, without #.')
      .addText((t) => t.setValue(s.analysis.excludeTags.join(', ')).onChange((v) => void ctl.updateSettings((x) => { x.analysis.excludeTags = csv(v); }, true)));

    new Setting(containerEl).setName('Thresholds').setHeading();
    const num = (name: string, desc: string, get: () => number, set: (n: number) => void, scale = 1) =>
      new Setting(containerEl).setName(name).setDesc(desc).addText((t) =>
        t.setValue(String(get() / scale)).onChange((v) => {
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) void ctl.updateSettings(() => set(n * scale), true);
        }));
    num('Oversized note (KB)', 'Notes above this size are listed under housekeeping.', () => s.analysis.thresholds.oversizedBytes, (n) => (s.analysis.thresholds.oversizedBytes = n), 1000);
    num('Large attachment (MB)', 'Attachments above this size are listed under housekeeping.', () => s.analysis.thresholds.largeAssetBytes, (n) => (s.analysis.thresholds.largeAssetBytes = n), 1024 * 1024);
    num('Minimum cluster size', 'Smallest connected group reported as an isolated cluster.', () => s.analysis.thresholds.minClusterSize, (n) => (s.analysis.thresholds.minClusterSize = Math.round(n)));

    new Setting(containerEl).setName('Scanning').setHeading();
    new Setting(containerEl).setName('Read research note text').setDesc('Looks for URLs, footnotes and citation keys in research and source notes only. Turn off for very large vaults or to skip file reads.')
      .addToggle((t) => t.setValue(s.scanBodies).onChange((v) => void ctl.updateSettings((x) => { x.scanBodies = v; }, true)));
    new Setting(containerEl).setName('Refresh automatically').setDesc('Re-scan a few seconds after the vault changes, only while a Vault Health view is open.')
      .addToggle((t) => t.setValue(s.autoRefresh).onChange((v) => void ctl.updateSettings((x) => { x.autoRefresh = v; }, false)));

    new Setting(containerEl).setName('Scoring').setHeading();
    containerEl.createEl('p', { cls: 'setting-item-description', text: 'Defaults are documented in docs/SCORING.md. Tolerance is the affected rate at which a metric scores 0; weight is its importance inside its dimension.' });
    let tierDraft = JSON.stringify({ tierWeights: s.scoring.tierWeights, hygieneCap: s.scoring.hygieneCap, minSample: s.scoring.minSample, issueAgeDays: s.scoring.issueAgeDays, overrides: s.scoring.overrides }, null, 2);
    const scErr = containerEl.createDiv({ cls: 'vh-error vh-hidden' });
    new Setting(containerEl).setName('Scoring overrides (advanced)')
      .setDesc(`JSON. overrides keys: ${Object.keys(METRICS).slice(0, 3).join(', ')}, … each with optional "tolerance" (0–1) and "weight".`)
      .addTextArea((t) => { t.setValue(tierDraft).onChange((v) => (tierDraft = v)); t.inputEl.rows = 10; t.inputEl.addClass('vh-json'); })
      .addButton((b) => b.setButtonText('Apply').onClick(() => {
        try {
          const p = JSON.parse(tierDraft) as Partial<typeof s.scoring>;
          const cap = p.hygieneCap ?? s.scoring.hygieneCap;
          if (typeof cap !== 'number' || cap < 0 || cap > 1) throw new Error('hygieneCap must be between 0 and 1');
          void ctl.updateSettings((x) => { x.scoring = { ...x.scoring, ...p, tierWeights: { ...x.scoring.tierWeights, ...(p.tierWeights ?? {}) } }; }, false).then(() => this.display());
        } catch (e) {
          scErr.removeClass('vh-hidden');
          scErr.setText(`Not applied: ${e instanceof Error ? e.message : String(e)}`);
        }
      }))
      .addButton((b) => b.setButtonText('Reset to defaults').onClick(() => { ctl.resetScoring(); this.display(); }));

    new Setting(containerEl).setName('What this plugin stores').setHeading();
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Only this plugin’s data.json: your settings, plus for each finding you ignored or reviewed (and each high/medium finding, for issue age) its rule, a few file paths, a status and timestamps. No note content is stored. Analysis results live in memory and are rebuilt from Obsidian’s own index. Nothing is sent anywhere.',
    });
  }

  private renderMatchCounts(el: HTMLElement): void {
    const st = this.ctl.state;
    const box = el.createDiv({ cls: 'vh-matchcounts' });
    if (!st) {
      box.createEl('p', { cls: 'setting-item-description', text: 'Open the Vault Health dashboard to scan; match counts appear here.' });
      return;
    }
    const counts = new Map<string, number>();
    for (const n of st.analysis.ctx.all) for (const r of n.roles) counts.set(r, (counts.get(r) ?? 0) + 1);
    const ul = box.createEl('ul');
    for (const r of this.ctl.settings.analysis.conventions.roles) {
      ul.createEl('li', { text: `${r.label} (“${r.id}”): ${counts.get(r.id) ?? 0} notes match` });
    }
    if (this.ctl.settings.analysis.conventions.roles.length === 0) ul.createEl('li', { text: 'No roles defined.' });
  }

  private renderDiscovery(el: HTMLElement): void {
    const st = this.ctl.state;
    if (!st) return;
    const d = discoverConventions(st.analysis.ctx.all, 12);
    const det = el.createEl('details', { cls: 'vh-discovery' });
    det.createEl('summary', { text: 'What your vault already uses (read-only survey)' });
    const list = (title: string, items: string[]) => {
      det.createEl('h5', { text: title });
      det.createEl('p', { cls: 'setting-item-description', text: items.length ? items.join(' · ') : 'none found' });
    };
    list('Properties', d.properties.map((p) => `${p.key} (${p.count})${p.topValues.length ? ': ' + p.topValues.map((v) => v.value).join(', ') : ''}`));
    list('Tags', d.tags.map((t) => `#${t.tag} (${t.count})`));
    list('Top-level folders', d.folders.map((f) => `${f.folder} (${f.count})`));
  }
}

function slim(c: ConventionSet) {
  return { roles: c.roles, provenance: c.provenance, sourceRequirement: c.sourceRequirement, researchRequirement: c.researchRequirement };
}
