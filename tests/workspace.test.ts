import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAnalysis } from '../src/analysis/AnalysisEngine.ts';
import { makeItem } from '../src/analysis/items.ts';
import { IssueRegistry } from '../src/registry/IssueRegistry.ts';
import { WorkspaceManager, sanitizeStore } from '../src/workspace/core/WorkspaceManager.ts';
import { resolveScope } from '../src/workspace/core/scope.ts';
import { findConnectedNotes } from '../src/workspace/discovery/connected.ts';
import { suggestRelinks } from '../src/workspace/discovery/relink.ts';
import { workspaceRules, workspaceIdOfKey } from '../src/workspace/diagnostics/rules.ts';
import { analyzeLocalGraph, selectGraphNodes } from '../src/workspace/graph/localGraph.ts';
import { layoutGraph } from '../src/workspace/graph/layout.ts';
import { analyzeWorkspace, memberItemFilter } from '../src/workspace/integration/analyze.ts';
import { handleRename, handleWorkspaceDeleted } from '../src/workspace/integration/lifecycle.ts';
import { WorkspaceError } from '../src/workspace/model/types.ts';
import { bigVault, config, note, snapshot } from './fixtures/vault.ts';

// ---------- manager ----------
test('create / rename / delete: names are validated and unique (case-insensitive)', () => {
  const m = new WorkspaceManager();
  const a = m.create('  AI and Labor Economics ');
  assert.equal(a.name, 'AI and Labor Economics');
  assert.throws(() => m.create('ai and labor economics'), (e: unknown) => e instanceof WorkspaceError && e.code === 'duplicate-name');
  assert.throws(() => m.create('   '), (e: unknown) => e instanceof WorkspaceError && e.code === 'empty-name');
  assert.throws(() => m.create('x'.repeat(81)), (e: unknown) => e instanceof WorkspaceError && e.code === 'name-too-long');
  const b = m.create('Impressionism');
  m.rename(b.id, 'Impressionism 1870s');
  assert.equal(m.get(b.id)?.name, 'Impressionism 1870s');
  m.rename(a.id, 'AI and Labor Economics'); // renaming to its own name is fine
  assert.throws(() => m.rename(b.id, 'AI and Labor Economics'), (e: unknown) => e instanceof WorkspaceError);
  assert.equal(m.delete(a.id), true);
  assert.equal(m.delete(a.id), false);
  assert.equal(m.list().length, 1);
});

test('add/remove notes store references, ignore duplicates, and are per workspace', () => {
  const m = new WorkspaceManager();
  const a = m.create('A');
  const b = m.create('B');
  assert.equal(m.addNotes(a.id, ['AI.md', 'Labor.md', 'AI.md', '']), 2);
  assert.equal(m.addNotes(b.id, ['AI.md']), 1, 'the same note can live in several workspaces');
  assert.equal(m.removeNotes(a.id, ['AI.md', 'Nope.md']), 1);
  assert.deepEqual(m.get(a.id)?.notes.map((r) => r.path), ['Labor.md']);
  assert.deepEqual(m.get(b.id)?.notes.map((r) => r.path), ['AI.md']);
});

test('deleting a workspace removes only that workspace', () => {
  const m = new WorkspaceManager();
  const a = m.create('A', ['x.md']);
  const b = m.create('B', ['y.md']);
  const before = JSON.stringify(m.get(b.id));
  m.delete(a.id);
  assert.equal(JSON.stringify(m.get(b.id)), before);
});

test('rename/move migration: file, folder prefix, and collisions', () => {
  const m = new WorkspaceManager();
  const w = m.create('W', ['Old/a.md', 'Old/sub/b.md', 'keep.md', 'New/a.md']);
  assert.equal(m.migrateRename('Old', 'New'), 2);
  assert.deepEqual(m.get(w.id)?.notes.map((r) => r.path).sort(), ['New/a.md', 'New/sub/b.md', 'keep.md']);
  assert.equal(m.migrateRename('keep.md', 'kept.md'), 1);
  assert.ok(m.get(w.id)?.notes.some((r) => r.path === 'kept.md'));
});

test('relink replaces a reference and preserves its added date; collisions merge', () => {
  let t = 100;
  const m = new WorkspaceManager(undefined, () => t++);
  const w = m.create('W', ['gone.md', 'there.md']);
  const added = m.get(w.id)!.notes[0]!.addedAt;
  assert.equal(m.relink(w.id, 'gone.md', 'moved.md'), true);
  assert.equal(m.get(w.id)!.notes[0]!.path, 'moved.md');
  assert.equal(m.get(w.id)!.notes[0]!.addedAt, added);
  m.relink(w.id, 'moved.md', 'there.md');
  assert.deepEqual(m.get(w.id)!.notes.map((r) => r.path), ['there.md']);
});

test('persistence round-trips and corrupt data is repaired, never thrown on', () => {
  const m = new WorkspaceManager();
  const w = m.create('Round trip', ['a.md', 'b.md']);
  const again = new WorkspaceManager(JSON.parse(JSON.stringify(m.toJSON())));
  assert.deepEqual(again.get(w.id), m.get(w.id));
  const repaired = sanitizeStore({
    workspaces: [
      { id: 'a', name: 'Dup', notes: [{ path: 'x.md' }, { path: 'x.md' }, { path: 5 }, null, { path: '' }] },
      { id: 'a', name: 'Same id' },
      { id: 'b', name: 'dup', notes: 'not an array' },
      { name: 'no id' }, 7, null,
      { id: 'c', name: '' },
    ],
  }, 1);
  assert.deepEqual(repaired.map((w2) => w2.id), ['a', 'b', 'c']);
  assert.deepEqual(repaired[0]!.notes.map((r) => r.path), ['x.md']);
  assert.deepEqual(new Set(repaired.map((w2) => w2.name.toLowerCase())).size, 3, 'names made unique');
  assert.deepEqual(sanitizeStore('garbage', 1), []);
  assert.deepEqual(new WorkspaceManager(undefined).list(), []);
});

// ---------- fixtures ----------
const R = { type: 'research' };
const S = { type: 'source' };
async function vault() {
  const notes = [
    note('AI.md', { props: R, links: ['Automation.md', 'Productivity.md', 'Index.md', 'Wiki.md'], body: { urls: [], footnotes: 0, citekeys: [] } }),
    note('Automation.md', { props: R, links: ['Labor.md', 'src-oecd.md'] }),
    note('Labor.md', { links: ['Economics.md'] }),
    note('Economics.md'),
    note('Productivity.md', { links: ['AI.md'] }),
    note('Employment.md'),                                            // isolated within the workspace
    note('src-oecd.md', { props: { ...S, url: 'https://oecd.org/x' } }),
    note('src-unused.md', { props: { ...S, url: 'https://oecd.org/y' } }),
    note('Index.md', { links: ['AI.md', 'Labor.md', 'Economics.md', 'Employment.md', 'Other.md'] }),
    note('Wiki.md', { links: ['AI.md'] }),
    note('Other.md'),
    note('Templates/T.md', { links: ['AI.md'] }),
  ];
  const r = await runAnalysis(snapshot(notes), config(), { yieldFn: async () => {} });
  assert.ok(r);
  return r;
}
const MEMBERS = ['AI.md', 'Automation.md', 'Labor.md', 'Economics.md', 'Productivity.md', 'Employment.md'];

test('scope keeps missing references visible instead of dropping them', async () => {
  const r = await vault();
  const m = new WorkspaceManager();
  const w = m.create('W', [...MEMBERS, 'Deleted.md']);
  const scope = resolveScope(w, (p) => r.ctx.allByPath.has(p));
  assert.equal(scope.members.length, 6);
  assert.deepEqual(scope.missing.map((x) => x.path), ['Deleted.md']);
});

// ---------- local graph ----------
test('local graph: internal vs external counts, clusters, isolated, density', async () => {
  const r = await vault();
  const g = analyzeLocalGraph(r.ctx, [...MEMBERS].sort());
  const i = (p: string) => g.members.indexOf(p);
  assert.equal(g.totals.internalConnections, 4, 'AI–Automation, AI–Productivity, Automation–Labor, Labor–Economics');
  assert.equal(g.internalDegree[i('AI.md')], 2);
  assert.equal(g.internalDegree[i('Employment.md')], 0);
  assert.equal(g.externalOut[i('AI.md')], 2, 'AI links out to Index and Wiki');
  assert.equal(g.externalIn[i('AI.md')], 2, 'Index and Wiki link in; the excluded template does not count');
  assert.equal(g.externalIn[i('Labor.md')], 1);
  assert.equal(g.externalOut[i('Automation.md')], 1, 'the source note is outside the workspace');
  assert.equal(g.clusters.length, 1);
  assert.equal(g.clusters[0]!.members.length, 5);
  assert.deepEqual(g.isolated.map((x) => g.members[x]), ['Employment.md']);
  assert.ok(Math.abs(g.totals.density - 4 / 15) < 1e-9);
  assert.equal(g.clusterOf[i('Employment.md')], -1);
});

test('clusters: two separate groups are reported, largest first', async () => {
  const notes = [
    note('a1.md', { links: ['a2.md'] }), note('a2.md', { links: ['a3.md'] }), note('a3.md'),
    note('b1.md', { links: ['b2.md'] }), note('b2.md'), note('lone.md'),
  ];
  const r = await runAnalysis(snapshot(notes), config(), { yieldFn: async () => {} });
  const g = analyzeLocalGraph(r!.ctx, notes.map((n) => n.path).sort());
  assert.deepEqual(g.clusters.map((c) => c.members.length), [3, 2]);
  assert.deepEqual(g.isolated.map((x) => g.members[x]), ['lone.md']);
});

test('layout is deterministic, bounded and handles tiny graphs', () => {
  assert.deepEqual(layoutGraph(0, []), { x: [], y: [] });
  assert.deepEqual(layoutGraph(1, []), { x: [0.5], y: [0.5] });
  const edges: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5]];
  const a = layoutGraph(6, edges);
  const b = layoutGraph(6, edges);
  assert.deepEqual(a, b);
  for (const v of [...a.x, ...a.y]) assert.ok(v >= 0.05 - 1e-9 && v <= 0.95 + 1e-9 && Number.isFinite(v));
  const t0 = Date.now();
  layoutGraph(150, Array.from({ length: 300 }, (_, i) => [i % 150, (i * 7 + 1) % 150] as [number, number]));
  assert.ok(Date.now() - t0 < 2000, 'a 150-node layout must be fast');
});

test('graph drawing is capped to the most connected members', async () => {
  const r = await vault();
  const g = analyzeLocalGraph(r.ctx, [...MEMBERS].sort());
  const picked = selectGraphNodes(g, 3);
  assert.equal(picked.length, 3);
  assert.ok(picked.map((x) => g.members[x]).includes('AI.md'));
  assert.equal(selectGraphNodes(g, 50).length, 6);
});

// ---------- discovery ----------
test('add connected notes: ranked by connections, hubs flagged by low specificity, excluded notes never suggested', async () => {
  const r = await vault();
  const scope = resolveScope(new WorkspaceManager().create('W', MEMBERS), (p) => r.ctx.allByPath.has(p));
  const c = findConnectedNotes(r.ctx, scope);
  const paths = c.map((x) => x.path);
  assert.ok(!paths.includes('Templates/T.md'), 'excluded folders are not suggested');
  assert.ok(!paths.some((p) => MEMBERS.includes(p)), 'members are never suggested');
  assert.equal(paths[0], 'Index.md', 'Index connects to four members');
  assert.equal(c[0]!.connections, 4, 'AI, Labor, Economics, Employment');
  const wiki = c.find((x) => x.path === 'Wiki.md')!;
  assert.equal(wiki.connections, 1);
  assert.ok(wiki.specificity >= c[0]!.specificity, 'the narrow note is more specific than the hub');
  assert.deepEqual(c.find((x) => x.path === 'src-oecd.md')!.linkedFromMembers, ['Automation.md']);
  assert.ok(findConnectedNotes(r.ctx, scope, { minConnections: 2 }).every((x) => x.connections >= 2));
});

test('relink suggestions match by file name only, and only for missing references', async () => {
  const notes = [note('Archive/Labor.md'), note('Other/Elsewhere.md')];
  const r = await runAnalysis(snapshot(notes), config(), { yieldFn: async () => {} });
  const m = new WorkspaceManager();
  const w = m.create('W', ['Labor.md', 'Other/Elsewhere.md', 'Gone.md']);
  const scope = resolveScope(w, (p) => r!.ctx.allByPath.has(p));
  const sug = suggestRelinks(r!.ctx, scope);
  assert.deepEqual([...sug.keys()].sort(), ['Gone.md', 'Labor.md']);
  assert.deepEqual(sug.get('Labor.md'), ['Archive/Labor.md']);
  assert.deepEqual(sug.get('Gone.md'), []);
});

// ---------- sources + integration ----------
test('workspace sources reuse vault provenance: member and cited sources, unsourced members', async () => {
  const r = await vault();
  const w = new WorkspaceManager().create('W', MEMBERS);
  const a = analyzeWorkspace(r.ctx, r.provenance, w, { issueCount: () => 0 });
  assert.deepEqual(a.sources.sources.map((s) => s.path), ['src-oecd.md'], 'only the cited source, not every source in the vault');
  assert.equal(a.sources.sources[0]!.inWorkspace, false);
  assert.deepEqual(a.sources.sources[0]!.citedByMembers, ['Automation.md']);
  assert.deepEqual(a.sources.unsourcedMembers, ['AI.md']);
  assert.equal(a.stats.researchNotes, 2);
  assert.equal(a.stats.sourced, 1);
  assert.equal(a.stats.sourcesAssociated, 1);
  assert.equal(a.stats.sourcesInWorkspace, 0);
  const withSource = analyzeWorkspace(r.ctx, r.provenance, new WorkspaceManager().create('W2', [...MEMBERS, 'src-oecd.md']), { issueCount: () => 0 });
  assert.equal(withSource.sources.sources[0]!.inWorkspace, true);
});

test('workspace stats and issue counts use the vault analysis for member notes only', async () => {
  const r = await vault();
  const w = new WorkspaceManager().create('W', MEMBERS);
  const open = new Map<string, number>();
  for (const o of r.outputs) for (const it of o.finding.items) for (const p of it.paths) open.set(p, (open.get(p) ?? 0) + 1);
  const a = analyzeWorkspace(r.ctx, r.provenance, w, { issueCount: (p) => open.get(p) ?? 0 });
  assert.ok(a.stats.openIssues >= MEMBERS.filter((p) => open.has(p)).length);
  const f = memberItemFilter(a.scope);
  const noSource = r.outputs.find((o) => o.finding.ruleId === 'research.note.no-source')!.finding.items;
  assert.deepEqual(noSource.filter(f).map((i) => i.paths[0]), ['AI.md']);
});

// ---------- diagnostics ----------
test('workspace diagnostics: missing, isolated, split, external-heavy', async () => {
  const r = await vault();
  const m = new WorkspaceManager();
  const w = m.create('W', [...MEMBERS, 'Gone.md', 'Archive/Labor.md']);
  const a = analyzeWorkspace(r.ctx, r.provenance, w, { issueCount: () => 0 });
  const items = (id: string) => a.outputs.find((o) => o.finding.ruleId === id)!.finding.items;
  assert.deepEqual(items('workspace.member.missing').map((i) => i.paths[0]).sort(), ['Archive/Labor.md', 'Gone.md']);
  assert.deepEqual(items('workspace.member.isolated').map((i) => i.paths[0]), ['Employment.md']);
  assert.equal(items('workspace.cluster.split').length, 0, 'one connected group is not a split');
  assert.equal(items('workspace.member.isolated')[0]!.severity, 'medium', 'it has external connections, so "add connected" may help');
  for (const o of a.outputs) for (const it of o.finding.items) assert.equal(workspaceIdOfKey(it.idKey), w.id);
});

test('split workspace is reported; ids differ between workspaces so ignoring is scoped', async () => {
  const notes = [note('a1.md', { links: ['a2.md'] }), note('a2.md'), note('b1.md', { links: ['b2.md'] }), note('b2.md'), note('b3.md', { links: ['b1.md'] })];
  const r = await runAnalysis(snapshot(notes), config(), { yieldFn: async () => {} });
  const m = new WorkspaceManager();
  const w1 = m.create('One', notes.map((n) => n.path));
  const w2 = m.create('Two', notes.map((n) => n.path));
  const a1 = analyzeWorkspace(r!.ctx, r!.provenance, w1, { issueCount: () => 0 });
  const a2 = analyzeWorkspace(r!.ctx, r!.provenance, w2, { issueCount: () => 0 });
  const split1 = a1.outputs.find((o) => o.finding.ruleId === 'workspace.cluster.split')!.finding.items;
  assert.equal(split1.length, 1);
  assert.equal(split1[0]!.units, 2);
  const split2 = a2.outputs.find((o) => o.finding.ruleId === 'workspace.cluster.split')!.finding.items;
  assert.notEqual(split1[0]!.id, split2[0]!.id);
});

// ---------- lifecycle / registry ----------
test('rename keeps workspace references and decisions attached; vault stays untouched', async () => {
  const r = await vault();
  const before = JSON.stringify(r.ctx.all);
  const m = new WorkspaceManager();
  const w = m.create('W', MEMBERS);
  const reg = new IssueRegistry({}, () => 1);
  const a = analyzeWorkspace(r.ctx, r.provenance, w, { issueCount: () => 0 });
  const iso = a.outputs.find((o) => o.finding.ruleId === 'workspace.member.isolated')!.finding.items[0]!;
  reg.ignore('workspace.member.isolated', iso);
  assert.equal(handleRename(m, reg, 'Employment.md', 'Jobs/Employment.md'), 1);
  assert.ok(m.get(w.id)!.notes.some((x) => x.path === 'Jobs/Employment.md'));
  const moved = makeItem('workspace.member.isolated', ['Jobs/Employment.md'], '', [], { idKey: `ws:${w.id}:isolated:Jobs/Employment.md` });
  assert.equal(reg.statusOf(moved.id), 'ignored', 'the ignore decision followed the note');
  assert.equal(JSON.stringify(r.ctx.all), before);
});

test('global sync never prunes workspace decisions; deleting a workspace drops only its own', async () => {
  const r = await vault();
  const m = new WorkspaceManager();
  const w1 = m.create('One', MEMBERS);
  const w2 = m.create('Two', MEMBERS);
  const reg = new IssueRegistry({}, () => 1);
  const pick = (w: typeof w1) => analyzeWorkspace(r.ctx, r.provenance, w, { issueCount: () => 0 }).outputs.find((o) => o.finding.ruleId === 'workspace.member.isolated')!.finding.items[0]!;
  const i1 = pick(w1);
  const i2 = pick(w2);
  reg.ignore('workspace.member.isolated', i1);
  reg.ignore('workspace.member.isolated', i2);
  reg.review('workspace.member.isolated', i2, () => 5);
  reg.sync(r.outputs, () => 5);                       // a global scan that knows nothing about workspaces
  assert.equal(reg.statusOf(i1.id), 'ignored');
  handleWorkspaceDeleted(reg, w1.id);
  assert.equal(reg.statusOf(i1.id), 'open');
  assert.notEqual(reg.statusOf(i2.id), 'open', 'the other workspace keeps its decision');
  // a vault finding decision is never affected
  const v = r.outputs.flatMap((o) => o.finding.items)[0]!;
  reg.ignore('x', v);
  handleWorkspaceDeleted(reg, w2.id);
  assert.equal(reg.statusOf(v.id), 'ignored');
});

test('scale: a 2,000-note workspace inside a 20,000-note vault analyzes quickly', async () => {
  const r = await runAnalysis(snapshot(bigVault(20_000)), config(), { yieldFn: async () => {} });
  const members = r!.ctx.notes.slice(0, 2000).map((n) => n.path);
  const t0 = Date.now();
  const a = analyzeWorkspace(r!.ctx, r!.provenance, new WorkspaceManager().create('Big', members), { issueCount: () => 0 });
  const c = findConnectedNotes(r!.ctx, a.scope);
  const ms = Date.now() - t0;
  assert.ok(ms < 2500, `workspace analysis took ${ms}ms`);
  assert.equal(a.stats.members, 2000);
  assert.ok(c.length > 0);
  console.log(`  2,000-note workspace analyzed in ${ms}ms`);
  void workspaceRules;
});
