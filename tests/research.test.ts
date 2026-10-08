import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAnalysis } from '../src/analysis/AnalysisEngine.ts';
import { buildResearchAreas, STANDALONE_ID } from '../src/analysis/research/areas.ts';
import { config, note, snapshot } from './fixtures/vault.ts';

const R = { type: 'research' };
const S = { type: 'source' };

async function run() {
  const notes = [
    // sourced via body link to a source note
    note('r-linked.md', { props: R, links: ['s-a.md'] }),
    // sourced via property link (resolved)
    note('r-prop.md', { props: { ...R, source: '[[S B]]' }, propLinks: [{ key: 'source', raw: 'S B', target: 's-b.md' }], links: ['s-b.md'] }),
    // sourced by identity property only
    note('r-doi.md', { props: { ...R, doi: 'https://doi.org/10.1000/ABC.1' } }),
    // citation signals only
    note('r-cite.md', { props: R, body: { urls: ['https://x.org/p'], footnotes: 1, citekeys: [] } }),
    // nothing at all (body scanned)
    note('r-none.md', { props: R, body: { urls: [], footnotes: 0, citekeys: [] }, links: ['r-linked.md'] }),
    // nothing, body not scanned -> lower severity, honest reason
    note('r-unscanned.md', { props: R, links: ['r-none.md'] }),
    // broken source pointer only
    note('r-broken.md', { props: { ...R, source: '[[Gone]]' }, propLinks: [{ key: 'source', raw: 'Gone', target: null }], links: ['r-none.md'] }),
    // orphan research note
    note('r-orphan.md', { props: R }),
    note('s-a.md', { props: { ...S, url: 'https://www.example.org/paper/?utm_source=x#sec' } }),
    note('s-b.md', { props: { ...S, url: 'http://example.org/paper' }, propLinks: [{ key: 'file', raw: 'b.pdf', target: null }] }),
    note('s-c.md', { props: { ...S, doi: '10.1000/xyz' } }),       // unreferenced, no other inbound
    note('s-d.md', { props: S }),                                  // unreferenced + missing metadata
  ];
  return runAnalysis(snapshot(notes), config(), { yieldFn: async () => {} });
}
const items = (r: Awaited<ReturnType<typeof run>>, id: string) =>
  r?.outputs.find((o) => o.finding.ruleId === id)?.finding.items ?? [];
const paths = (r: Awaited<ReturnType<typeof run>>, id: string) => items(r, id).map((i) => i.paths[0]).sort();

test('provenance classification partitions research notes', async () => {
  const r = await run();
  const st = (p: string) => r?.provenance.research.get(p)?.status;
  assert.equal(st('r-linked.md'), 'sourced');
  assert.equal(st('r-prop.md'), 'sourced');
  assert.equal(st('r-doi.md'), 'sourced');
  assert.equal(st('r-cite.md'), 'citation-only');
  assert.equal(st('r-none.md'), 'unsourced');
  assert.equal(st('r-broken.md'), 'broken-only');
});

test('no-source, citation-no-metadata, broken-link rules', async () => {
  const r = await run();
  assert.deepEqual(paths(r, 'research.note.no-source'), ['r-none.md', 'r-orphan.md', 'r-unscanned.md']);
  const unscanned = items(r, 'research.note.no-source').find((i) => i.paths[0] === 'r-unscanned.md');
  assert.equal(unscanned?.severity, 'medium');
  assert.ok(unscanned?.reason.includes('not scanned'));
  assert.deepEqual(paths(r, 'research.note.citation-no-metadata'), ['r-cite.md']);
  assert.deepEqual(paths(r, 'research.source.broken-link'), ['r-broken.md', 's-b.md']);
  assert.equal(r?.outputs.find((o) => o.finding.ruleId === 'research.source.broken-link')?.eligible, 3);
});

test('unreferenced sources and orphan research notes', async () => {
  const r = await run();
  assert.deepEqual(paths(r, 'research.source.unreferenced'), ['s-c.md', 's-d.md']);
  assert.deepEqual(paths(r, 'research.note.orphan'), ['r-cite.md', 'r-doi.md', 'r-orphan.md']);
});

test('duplicate sources: exact normalized url match only', async () => {
  const r = await run();
  const d = items(r, 'research.source.duplicate');
  assert.equal(d.length, 1);
  assert.deepEqual(d[0]?.paths, ['s-a.md', 's-b.md']);
  assert.equal(d[0]?.units, 2);
});

test('source metadata requirement flags only sources lacking every identifier', async () => {
  const r = await run();
  assert.deepEqual(paths(r, 'research.source.missing-metadata'), ['s-d.md']);
});

test('requirements disabled => metric not applicable (eligible 0)', async () => {
  const r = await run();
  assert.equal(r?.outputs.find((o) => o.finding.ruleId === 'research.note.missing-metadata')?.eligible, 0);
});

test('no research roles configured => research rules have nothing eligible (no false 100)', async () => {
  const r = await runAnalysis(snapshot([note('a.md')]), config(), { yieldFn: async () => {} });
  const noSource = r?.outputs.find((o) => o.finding.ruleId === 'research.note.no-source');
  assert.equal(noSource?.eligible, 0);
});

test('research areas: grouping, standalone bucket, per-note status, issue counts', async () => {
  const r = await run();
  assert.ok(r);
  const ws = buildResearchAreas(r.ctx, r.provenance, (p) => (p === 'r-none.md' ? 2 : 0));
  const standalone = ws.areas.find((a) => a.id === STANDALONE_ID);
  assert.ok(standalone, 'unlinked role notes are grouped');
  assert.ok(standalone.notes.some((n) => n.path === 'r-orphan.md'));
  const area = ws.areas.find((a) => a.notes.some((n) => n.path === 'r-linked.md'));
  assert.ok(area && area.id !== STANDALONE_ID);
  assert.ok(area.sources.some((s) => s.path === 's-a.md' && s.referencedBy.includes('r-linked.md')));
  assert.equal(ws.totals.researchNotes, 8);
  assert.equal(ws.totals.sources, 4);
  assert.equal(ws.totals.sourced, 3);
  assert.equal(ws.totals.unsourced, 3);
  assert.equal(ws.totals.issues, 2);
  assert.equal(ws.areas[ws.areas.length - 1]?.id, STANDALONE_ID, 'standalone sorts last');
});
