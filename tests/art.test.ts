import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAnalysis } from '../src/analysis/AnalysisEngine.ts';
import { parseYear } from '../src/analysis/art/dates.ts';
import { config, note, snapshot } from './fixtures/vault.ts';

test('parseYear reads only what is written', () => {
  assert.deepEqual(parseYear('1937'), { year: 1937, approx: false });
  assert.deepEqual(parseYear('1937-04-26'), { year: 1937, approx: false });
  assert.deepEqual(parseYear('c. 1937'), { year: 1937, approx: true });
  assert.deepEqual(parseYear('ca.1880'), { year: 1880, approx: true });
  assert.deepEqual(parseYear('1937?'), { year: 1937, approx: true });
  assert.deepEqual(parseYear('1880s'), { year: 1880, approx: true });
  assert.deepEqual(parseYear('1880–85'), { year: 1880, approx: true });
  assert.deepEqual(parseYear('1880-1885'), { year: 1880, approx: true });
  for (const bad of ['', 'sometime in the 19th century', '300 BCE', 'unknown']) assert.equal(parseYear(bad), null, bad);
});

const A = { type: 'artwork' };
async function run() {
  const notes = [
    note('art/guernica.md', { props: { ...A, artist: '[[Pablo Picasso]]', year: 1937, medium: 'oil', movement: 'Cubism', source: 'Museo Reina Sofía', image: '[[guernica.jpg]]' },
      propLinks: [{ key: 'image', raw: 'guernica.jpg', target: 'img/guernica.jpg' }] }),
    note('art/weeping.md', { props: { ...A, artist: 'Pablo Picasso', year: 'c. 1937', medium: 'oil', movement: 'cubism' }, embeds: [{ raw: 'w.png', target: 'img/w.png' }] }),
    note('art/water-lilies.md', { props: { ...A, artist: 'Claude Monet', year: 'late 19th century', image: '[[nope.jpg]]' }, propLinks: [{ key: 'image', raw: 'nope.jpg', target: null }] }),
    note('art/untitled.md', { props: { ...A } }),
    note('art/ghost.md', { tags: ['artwork'] }),
    note('other.md'),
  ];
  return runAnalysis(snapshot(notes), config(), { yieldFn: async () => {} });
}
const paths = (r: Awaited<ReturnType<typeof run>>, id: string) =>
  (r?.outputs.find((o) => o.finding.ruleId === id)?.finding.items ?? []).map((i) => i.paths[0]).sort();

test('artwork role is detected by property or tag; facets merge case and link syntax', async () => {
  const r = await run();
  assert.equal(r?.art.artworks.length, 5);
  assert.deepEqual(r?.art.facets.artist.map((f) => [f.value, f.count]), [['Pablo Picasso', 2], ['Claude Monet', 1]]);
  assert.deepEqual(r?.art.facets.movement.map((f) => [f.value.toLowerCase(), f.count]), [['cubism', 2]]);
  assert.deepEqual(r?.art.facets.medium.map((f) => [f.value, f.count]), [['oil', 2]]);
});

test('missing metadata is reported per required field, with eligible = artwork count', async () => {
  const r = await run();
  assert.deepEqual(paths(r, 'art.artwork.missing.artist'), ['art/ghost.md', 'art/untitled.md']);
  assert.deepEqual(paths(r, 'art.artwork.missing.year'), ['art/ghost.md', 'art/untitled.md']);
  assert.deepEqual(paths(r, 'art.artwork.missing.source'), ['art/ghost.md', 'art/untitled.md', 'art/water-lilies.md', 'art/weeping.md']);
  assert.equal(r?.outputs.find((o) => o.finding.ruleId === 'art.artwork.missing.artist')?.eligible, 5);
  assert.equal(r?.outputs.find((o) => o.finding.ruleId === 'art.artwork.missing.movement'), undefined, 'optional fields are not reported unless required');
});

test('images: embedded image counts; broken image link is "broken", not "missing"', async () => {
  const r = await run();
  assert.deepEqual(paths(r, 'art.artwork.missing.image'), ['art/ghost.md', 'art/untitled.md']);
  assert.deepEqual(paths(r, 'art.artwork.broken-image'), ['art/water-lilies.md']);
  assert.equal(r?.art.missing.image, 2);
});

test('unreadable dates are listed, not guessed; absent dates are only "missing"', async () => {
  const r = await run();
  assert.deepEqual(paths(r, 'art.artwork.unparseable-date'), ['art/water-lilies.md']);
  assert.equal(r?.outputs.find((o) => o.finding.ruleId === 'art.artwork.unparseable-date')?.eligible, 3, 'only dated artworks are eligible');
});

test('art module off => no art rules; no artworks => nothing eligible', async () => {
  const cfg = config({ modules: { structure: true, research: true, media: true, hygiene: true, art: false } });
  const off = await runAnalysis(snapshot([note('a.md', { props: A })], [], cfg), cfg, { yieldFn: async () => {} });
  assert.ok(!off?.outputs.some((o) => o.finding.ruleId.startsWith('art.')));
  const none = await runAnalysis(snapshot([note('a.md')]), config(), { yieldFn: async () => {} });
  assert.ok(none?.outputs.filter((o) => o.finding.ruleId.startsWith('art.')).every((o) => o.eligible === 0));
});
