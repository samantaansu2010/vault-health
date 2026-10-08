import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { FakeEl } from './fixtures/obsidian-fake.mjs';

register('./fixtures/obsidian-hooks.mjs', import.meta.url);
const fake = await import('./fixtures/obsidian-fake.mjs');
const { HealthController } = await import('../src/controller.ts');
const { WorkspaceView } = await import('../src/ui/workspace/WorkspaceView.ts');
const { DashboardView } = await import('../src/ui/DashboardView.ts');
const { ResearchAnalysisView } = await import('../src/ui/ResearchAnalysisView.ts');
const { ArtView } = await import('../src/ui/ArtView.ts');
const { VaultHealthSettingTab } = await import('../src/settings/SettingsTab.ts');

interface F { path: string; name: string; basename: string; extension: string; stat: { size: number; mtime: number; ctime: number }; parent: null }
const mk = (path: string, size = 600): F => {
  const name = path.split('/').pop() as string;
  return Object.assign(new fake.TFile(), { path, name, basename: name.replace(/\.[^.]+$/, ''), extension: name.includes('.') ? (name.split('.').pop() as string) : '', stat: { size, mtime: 7, ctime: 1 }, parent: null }) as F;
};

/** A small fake vault. Note there is deliberately NO write API on vault/metadataCache: any mutation attempt throws. */
function build() {
  const names = ['AI', 'Automation', 'Labor', 'Economics', 'Productivity', 'Employment', 'Index', 'Wiki', 'Smith2020'];
  const notes = names.map((n) => mk(`${n}.md`));
  const files: F[] = [...notes, mk('img/pic.png', 5000), mk('Paper.pdf', 9000)];
  const links: Record<string, string[]> = {
    'AI.md': ['Automation.md', 'Productivity.md', 'Index.md', 'Wiki.md', 'Smith2020.md'],
    'Automation.md': ['Labor.md'], 'Labor.md': ['Economics.md'], 'Productivity.md': ['AI.md'],
    'Index.md': ['AI.md', 'Labor.md', 'Economics.md', 'Employment.md'], 'Wiki.md': ['AI.md'],
  };
  const fm: Record<string, Record<string, unknown>> = {
    'AI.md': { type: 'research' }, 'Automation.md': { type: 'research', source: '[[Smith2020]]' },
    'Smith2020.md': { type: 'source', url: 'https://example.org/s' }, 'Labor.md': { tags: ['econ'] },
  };
  const cache = (p: string) => ({ frontmatter: fm[p] ? { ...fm[p], position: {} } : undefined, frontmatterPosition: fm[p] ? { start: { offset: 0 }, end: { offset: 10 } } : undefined, embeds: [], tags: [] });
  const byName = new Map(files.map((f) => [f.name.replace(/\.md$/, ''), f]));
  const app = {
    vault: { getMarkdownFiles: () => notes, getFiles: () => files, cachedRead: async () => '---\nx\n---\nSee https://example.org and [^1].', getAbstractFileByPath: (p: string) => files.find((f) => f.path === p) ?? null, on() { return {}; } },
    metadataCache: {
      resolvedLinks: Object.fromEntries(notes.map((n) => [n.path, Object.fromEntries((links[n.path] ?? []).map((t) => [t, 1]))])),
      unresolvedLinks: Object.fromEntries(notes.map((n) => [n.path, {}])),
      getFileCache: (f: F) => cache(f.path),
      getFirstLinkpathDest: (l: string) => byName.get(l.replace(/\.md$/, '')) ?? null,
      on() { return {}; },
    },
    workspace: {
      getLeavesOfType: () => [] as unknown[], getLeaf: () => ({ openFile: async (f: F) => { opened.push(f.path); }, setViewState: async () => {} }),
      revealLeaf: async () => {}, requestSaveLayout: () => {}, getActiveFile: () => null,
    },
  };
  const opened: string[] = [];
  return { app, opened, snapshotOfFiles: JSON.stringify(files) };
}

async function setup() {
  const b = build();
  const saved: unknown[] = [];
  const plugin = { app: b.app, loadData: async () => null, saveData: async (d: unknown) => { saved.push(JSON.parse(JSON.stringify(d))); } };
  const ctl = new HealthController(plugin as never, undefined);
  await ctl.refresh();
  assert.ok(ctl.state, 'scan finished');
  return { ...b, ctl, saved, leaf: { app: b.app, view: null } };
}
const text = (el: FakeEl) => el.textContent;
const buttons = (root: FakeEl, label: string | RegExp) =>
  fake.walk(root, (e) => e.tag === 'button' && (typeof label === 'string' ? e.text === label : label.test(e.text)));
const tab = (root: FakeEl, label: string) => fake.walk(root, (e) => e.tag === 'button' && e.attrs.role === 'tab' && e.text === label)[0]!;

test('every module loads (esbuild would bundle this same graph) and main exports the plugin class', async () => {
  const all: string[] = [];
  const walkDir = (d: string) => readdirSync(d).forEach((f) => { const p = join(d, f); if (statSync(p).isDirectory()) walkDir(p); else if (p.endsWith('.ts')) all.push(p); });
  walkDir('src');
  for (const p of all) await import('../' + p);
  const main = await import('../src/main.ts');
  assert.equal(typeof main.default, 'function');
});

test('workspace: every tab renders; add, remove, rename and delete only touch workspace metadata', async () => {
  const { ctl, app, opened, snapshotOfFiles, leaf } = await setup();
  const w = ctl.createWorkspace('AI and Labor Economics', ['AI.md', 'Automation.md', 'Labor.md', 'Economics.md', 'Productivity.md', 'Employment.md']);
  const view = new WorkspaceView(leaf as never, ctl);
  await view.onOpen();
  await view.setState({ workspaceId: w.id }, { history: false });
  const root = view.contentEl as unknown as FakeEl;
  assert.ok(text(root).includes('AI and Labor Economics'));
  assert.ok(text(root).includes('never changes your notes'));

  // Overview
  assert.ok(text(root).includes('internal connections') && text(root).includes('links out'));
  // Notes
  tab(root, 'Notes').click();
  assert.ok(text(root).includes('Employment') && text(root).includes('Internal (in / out)'));
  const rowOf = (name: string) => fake.walk(root, (e) => e.tag === 'tr' && text(e).includes(name))[0]!;
  assert.ok(text(rowOf('Employment')).includes('unconnected'));
  // Graph
  tab(root, 'Graph & clusters').click();
  assert.equal(fake.walk(root, (e) => e.tag === 'svg').length, 1);
  const gnodes = () => fake.walk(root, (e) => (e.attrs.class ?? '').includes('vh-gnode'));
  assert.equal(gnodes().length, 6);
  assert.equal(gnodes().filter((e) => e.attrs.class!.includes('isolated')).length, 1, 'Employment is drawn hollow');
  assert.ok(text(root).includes('Connected groups (1)'));
  gnodes()[0]!.click(); // opens a note, read-only
  assert.equal(opened.length, 1);
  buttons(root, /^Group 1/)[0]!.click(); // focus a cluster
  // Connected
  tab(root, 'Add connected').click();
  assert.ok(text(root).includes('Index') && text(root).includes('Wiki') && text(root).includes('Smith2020'));
  buttons(root, 'Add to workspace').find((_, i) => i === 0)!.click();
  const afterAdd = ctl.workspaces.get(w.id)!.notes.length;
  assert.equal(afterAdd, 7);
  // Sources
  tab(root, 'Sources').click();
  assert.ok(text(root).includes('Source coverage') && text(root).includes('Sources associated with this workspace'));
  // Diagnostics
  tab(root, 'Diagnostics').click();
  assert.ok(text(root).includes('Workspace notes not connected') || text(root).includes('Findings in its notes'));
  // Remove via the Notes tab
  tab(root, 'Notes').click();
  buttons(root, 'Remove').find((b) => b.attrs['aria-label']?.includes('Employment'))!.click();
  assert.equal(ctl.workspaces.get(w.id)!.notes.some((r) => r.path === 'Employment.md'), false);
  // Rename
  buttons(root, 'Rename…')[0]!.click();
  const prompt = fake.state.modals.at(-1)!;
  const input = fake.walk(prompt.contentEl, (e) => e.tag === 'input')[0]!;
  input.value = 'Labor Economics';
  buttons(prompt.contentEl, 'Rename')[0]!.click();
  assert.equal(ctl.workspaces.get(w.id)!.name, 'Labor Economics');
  // Duplicate name shows an inline error and keeps the dialog open
  ctl.createWorkspace('Other');
  buttons(root, 'Rename…')[0]!.click();
  const p2 = fake.state.modals.at(-1)!;
  fake.walk(p2.contentEl, (e) => e.tag === 'input')[0]!.value = 'other';
  buttons(p2.contentEl, 'Rename')[0]!.click();
  assert.equal(p2.closed, false);
  assert.ok(text(p2.contentEl).includes('already exists'));
  // Delete: confirmation required; only the workspace goes
  buttons(root, 'Delete workspace…')[0]!.click();
  const confirm = fake.state.modals.at(-1)!;
  assert.equal(ctl.workspaces.list().length, 2, 'nothing deleted before confirming');
  buttons(confirm.contentEl, 'Delete workspace')[0]!.click();
  assert.equal(ctl.workspaces.get(w.id), undefined);
  assert.equal(ctl.workspaces.list().length, 1);
  assert.ok(fake.state.notices.some((n) => n.includes('Your notes were not changed')));
  assert.ok(text(root).includes('Research workspaces'), 'view falls back to the chooser');
  assert.equal(JSON.stringify(app.vault.getFiles()), snapshotOfFiles, 'the vault is exactly as it was');
});

test('workspace: missing notes are kept visible, can be relinked or removed, and a moved note is followed', async () => {
  const { ctl, leaf } = await setup();
  const w = ctl.createWorkspace('Gaps', ['AI.md', 'Gone/Labor.md', 'Vanished.md']);
  const view = new WorkspaceView(leaf as never, ctl);
  await view.onOpen();
  await view.setState({ workspaceId: w.id }, { history: false });
  const root = view.contentEl as unknown as FakeEl;
  tab(root, 'Notes').click();
  assert.ok(text(root).includes('can no longer be found') && text(root).includes('Vanished.md'));
  buttons(root, 'Relink to Labor.md')[0]!.click();           // same file name exists elsewhere
  assert.ok(ctl.workspaces.get(w.id)!.notes.some((r) => r.path === 'Labor.md'));
  buttons(root, 'Remove reference')[0]!.click();
  assert.deepEqual(ctl.workspaces.get(w.id)!.notes.map((r) => r.path).sort(), ['AI.md', 'Labor.md']);
  ctl.onRename('Labor.md', 'Moved/Labor.md');                 // Obsidian rename event
  assert.ok(ctl.workspaces.get(w.id)!.notes.some((r) => r.path === 'Moved/Labor.md'));
});

test('workspace data persists through saveData and reloads', async () => {
  const { ctl, saved, app } = await setup();
  const w = ctl.createWorkspace('Persist', ['AI.md']);
  await ctl.persist();
  const last = saved.at(-1) as { workspaces: { workspaces: { id: string; name: string }[] } };
  assert.equal(last.workspaces.workspaces[0]!.name, 'Persist');
  const again = new HealthController({ app, loadData: async () => null, saveData: async () => {} } as never, last);
  assert.equal(again.workspaces.get(w.id)?.name, 'Persist');
});

test('empty workspace and no-workspace states render helpful empty states', async () => {
  const { ctl, leaf } = await setup();
  const view = new WorkspaceView(leaf as never, ctl);
  await view.onOpen();
  assert.ok(text(view.contentEl as unknown as FakeEl).includes('No workspaces yet'));
  const w = ctl.createWorkspace('Empty');
  await view.setState({ workspaceId: w.id }, { history: false });
  assert.ok(text(view.contentEl as unknown as FakeEl).includes('This workspace is empty'));
  tab(view.contentEl as unknown as FakeEl, 'Add connected').click();
  assert.ok(text(view.contentEl as unknown as FakeEl).includes('Add a few notes first'));
});

test('the note picker adds references for ticked notes', async () => {
  const { ctl, leaf } = await setup();
  const w = ctl.createWorkspace('Pick');
  const view = new WorkspaceView(leaf as never, ctl);
  await view.onOpen();
  await view.setState({ workspaceId: w.id }, { history: false });
  buttons(view.contentEl as unknown as FakeEl, 'Add notes…')[0]!.click();
  const m = fake.state.modals.at(-1)!;
  const boxes = fake.walk(m.contentEl, (e) => e.tag === 'input' && e.attrs.id?.startsWith('vh-pick-') === true);
  assert.ok(boxes.length >= 9);
  boxes[0]!.checked = true; boxes[0]!.dispatch('change');
  boxes[1]!.checked = true; boxes[1]!.dispatch('change');
  buttons(m.contentEl, /^Add 2 notes/)[0]!.click();
  assert.equal(ctl.workspaces.get(w.id)!.notes.length, 2);
});

test('dashboard, research analysis, art view and settings render without errors', async () => {
  const { ctl, leaf } = await setup();
  for (const View of [DashboardView, ResearchAnalysisView, ArtView]) {
    const v = new View(leaf as never, ctl);
    await v.onOpen();
    assert.ok(text(v.contentEl as unknown as FakeEl).length > 50, View.name);
  }
  const dash = new DashboardView(leaf as never, ctl);
  await dash.onOpen();
  const labelled = (l: string) => fake.walk(dash.contentEl as unknown as FakeEl, (e) => e.tag === 'button' && e.attrs['aria-label'] === l);
  assert.equal(labelled('Workspaces').length, 1);
  assert.equal(labelled('Research analysis').length, 1);
  labelled('Workspaces')[0]!.click();
  assert.ok(fake.state.modals.at(-1)!.contentEl.textContent.includes('New workspace'));
  const tabEl = new VaultHealthSettingTab(leaf.app as never, {} as never, ctl);
  tabEl.display();
});
