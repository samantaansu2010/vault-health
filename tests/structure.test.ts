import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAnalysis } from '../src/analysis/AnalysisEngine.ts';
import { buildGraph } from '../src/analysis/graph.ts';
import { asset, config, note, snapshot } from './fixtures/vault.ts';

const find = (r: Awaited<ReturnType<typeof runAnalysis>>, id: string) => {
  const o = r?.outputs.find((x) => x.finding.ruleId === id);
  assert.ok(o, `rule ${id} should run`);
  return o;
};

test('graph components, main group and degrees', () => {
  const notes = [
    note('a.md', { links: ['b.md'] }), note('b.md', { links: ['c.md'] }), note('c.md'),
    note('x.md', { links: ['y.md'] }), note('y.md'), note('lonely.md'),
  ];
  const g = buildGraph(notes);
  assert.equal(g.compSizes.length, 3);
  assert.equal(g.compSizes[g.mainComp], 3);
});

test('orphans, dead-ends, broken links, isolated clusters', async () => {
  const notes = [
    note('hub.md', { links: ['leaf.md'], unresolved: ['Missing Note'] }),
    note('leaf.md'),
    note('orphan.md', { size: 4000 }),
    note('Templates/t.md'),                       // excluded folder
    note('pair1.md', { links: ['pair2.md'] }), note('pair2.md'),
  ];
  const r = await runAnalysis(snapshot(notes), config());
  const orphan = find(r, 'knowledge.orphan');
  assert.deepEqual(orphan?.finding.items.map((i) => i.paths[0]), ['orphan.md']);
  assert.equal(orphan?.finding.items[0]?.severity, 'medium', 'substantial orphan ranks higher');
  assert.equal(orphan?.eligible, 5);
  assert.deepEqual(find(r, 'knowledge.dead-end')?.finding.items.map((i) => i.paths[0]), ['leaf.md', 'pair2.md']);
  const broken = find(r, 'structure.link.broken');
  assert.equal(broken?.finding.items[0]?.units, 1);
  assert.equal(broken?.eligible, 3, 'resolved note links (2) + unresolved (1)');
  const cl = find(r, 'knowledge.cluster.isolated');
  assert.equal(cl?.finding.items.length, 1);
  assert.deepEqual(cl?.finding.items[0]?.paths, ['pair1.md', 'pair2.md']);
});

test('research clusters are reported under research, not as plain clusters', async () => {
  const notes = [
    note('m1.md', { links: ['m2.md'] }), note('m2.md', { links: ['m3.md'] }), note('m3.md'),
    note('r.md', { props: { type: 'research' }, links: ['s.md'] }), note('s.md', { props: { type: 'source' } }),
  ];
  const r = await runAnalysis(snapshot(notes), config());
  assert.equal(find(r, 'knowledge.cluster.isolated')?.finding.items.length, 0);
  const rc = find(r, 'research.cluster.disconnected');
  assert.equal(rc?.finding.items.length, 1);
  assert.equal(rc?.finding.items[0]?.units, 2);
  assert.equal(rc?.finding.tier, 'integrity');
});

test('broken embeds and unreferenced media; excluded notes still count as references', async () => {
  const notes = [
    note('a.md', { embeds: [{ raw: 'gone.png', target: null }, { raw: 'pic.png', target: 'img/pic.png' }], links: ['img/pic.png'] }),
    note('Templates/t.md', { links: ['img/tpl.png'] }),
  ];
  const r = await runAnalysis(snapshot(notes, [asset('img/pic.png'), asset('img/tpl.png'), asset('img/unused.png'), asset('doc.pdf', 'pdf')]), config());
  const be = find(r, 'visual.embed.broken');
  assert.equal(be?.finding.items.length, 1);
  assert.equal(be?.eligible, 2);
  assert.deepEqual(find(r, 'visual.asset.unreferenced')?.finding.items.map((i) => i.paths[0]), ['img/unused.png']);
  assert.deepEqual(find(r, 'research.pdf.unreferenced')?.finding.items.map((i) => i.paths[0]), ['doc.pdf']);
});

test('hygiene: singleton tags, oversized, empty', async () => {
  const notes = [
    note('a.md', { tags: ['common', 'once'] }), note('b.md', { tags: ['common'], size: 500_000 }), note('c.md', { empty: true, size: 0 }),
  ];
  const r = await runAnalysis(snapshot(notes), config());
  assert.deepEqual(find(r, 'hygiene.tag.singleton')?.finding.items.map((i) => i.idKey), ['tag:once']);
  assert.deepEqual(find(r, 'hygiene.note.oversized')?.finding.items.map((i) => i.paths[0]), ['b.md']);
  assert.deepEqual(find(r, 'hygiene.note.empty')?.finding.items.map((i) => i.paths[0]), ['c.md']);
});

test('disabled modules do not run', async () => {
  const cfg = config({ modules: { structure: true, research: false, media: false, hygiene: false, art: false } });
  const r = await runAnalysis(snapshot([note('a.md')], [], cfg), cfg);
  const ids = r?.outputs.map((o) => o.finding.ruleId) ?? [];
  assert.ok(ids.includes('knowledge.orphan'));
  assert.ok(!ids.some((i) => i.startsWith('research.') || i.startsWith('hygiene.') || i.startsWith('visual.')));
});

test('scale: 20k notes analyze quickly and stay deterministic', async () => {
  const { bigVault } = await import('./fixtures/vault.ts');
  const t0 = Date.now();
  const r1 = await runAnalysis(snapshot(bigVault(20_000)), config(), { yieldFn: async () => {} });
  const ms = Date.now() - t0;
  const r2 = await runAnalysis(snapshot(bigVault(20_000)), config(), { yieldFn: async () => {} });
  assert.ok(ms < 8000, `20k-note analysis took ${ms}ms`);
  assert.deepEqual(r1?.outputs.map((o) => o.finding.items.map((i) => i.id)), r2?.outputs.map((o) => o.finding.items.map((i) => i.id)));
  console.log(`  20k notes analyzed in ${ms}ms`);
});
