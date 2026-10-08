import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReport, type RegistryView } from '../src/scoring/HealthScorer.ts';
import { rankFindings } from '../src/scoring/priority.ts';
import { defaultScoring } from '../src/settings/defaults.ts';
import { makeItem, output } from '../src/analysis/items.ts';
import type { ItemStatus, RuleOutput, Tier, DimensionId, Severity } from '../src/model/types.ts';

const open: RegistryView = { statusOf: () => 'open', firstSeen: () => undefined };
const NOW = 10_000_000_000;

function out(ruleId: string, tier: Tier, dimension: DimensionId, severity: Severity, nItems: number, eligible: number, sev?: Severity): RuleOutput {
  const items = Array.from({ length: nItems }, (_, i) => makeItem(ruleId, [`${ruleId}-${i}.md`], 'why', [], sev ? { severity: sev } : {}));
  return output({ ruleId, tier, dimension, severity, title: ruleId, description: '', suggestion: '' }, items, eligible);
}

test('metric formula matches the documented example (14/212, tolerance 10% => 34)', () => {
  const rep = computeReport([out('knowledge.orphan', 'structure', 'knowledge', 'low', 14, 212)], open, defaultScoring(), NOW);
  const m = rep.metrics.find((x) => x.id === 'knowledge.orphan')!;
  assert.equal(Math.round(m.score!), 34);
  assert.equal(m.affected, 14);
  assert.equal(m.eligible, 212);
  assert.ok(m.formula.includes('14 ÷ 212'));
  assert.ok(m.formula.includes('= 34'));
});

test('n/a and insufficient data are never scored as 100', () => {
  const rep = computeReport([
    out('research.note.no-source', 'integrity', 'research', 'high', 0, 0),
    out('research.source.unreferenced', 'integrity', 'sources', 'medium', 1, 3),
  ], open, defaultScoring(), NOW);
  assert.equal(rep.metrics.find((m) => m.id === 'research.note.no-source')!.status, 'not-applicable');
  assert.equal(rep.metrics.find((m) => m.id === 'research.source.unreferenced')!.status, 'insufficient-data');
  const research = rep.dimensions.find((d) => d.id === 'research')!;
  assert.equal(research.score, null);
  assert.equal(rep.overall.score, null);
});

test('ignored items are excluded from affected; reviewed items stay counted', () => {
  const o = out('knowledge.orphan', 'structure', 'knowledge', 'low', 10, 100);
  const ids = o.finding.items.map((i) => i.id);
  const view: RegistryView = {
    statusOf: (id): ItemStatus => (id === ids[0] || id === ids[1] ? 'ignored' : id === ids[2] ? 'reviewed' : 'open'),
    firstSeen: () => undefined,
  };
  const m = computeReport([o], view, defaultScoring(), NOW).metrics.find((x) => x.id === 'knowledge.orphan')!;
  assert.equal(m.affected, 8);
  assert.equal(m.ignored, 2);
});

test('hygiene contribution is capped at 20% of a dimension', () => {
  const core = out('structure.link.broken', 'structure', 'structure', 'low', 0, 100);         // score 100
  const hyg = [
    out('hygiene.tag.singleton', 'hygiene', 'structure', 'info', 100, 100),                     // score 0
    out('hygiene.note.oversized', 'hygiene', 'structure', 'info', 100, 100),
    out('hygiene.note.empty', 'hygiene', 'structure', 'info', 100, 100),
  ];
  const rep = computeReport([core, ...hyg], open, defaultScoring(), NOW);
  const dim = rep.dimensions.find((d) => d.id === 'structure')!;
  assert.ok(Math.abs(dim.score! - 80) < 1e-9, `expected 80, got ${dim.score}`);
  const shares = rep.metrics.filter((m) => m.dimension === 'structure' && m.status === 'scored').reduce((a, m) => a + m.share, 0);
  assert.ok(Math.abs(shares - 1) < 1e-9);
});

test('a dimension with only housekeeping metrics gets no score', () => {
  const rep = computeReport([out('visual.asset.unreferenced', 'hygiene', 'visual', 'low', 5, 50)], open, defaultScoring(), NOW);
  const v = rep.dimensions.find((d) => d.id === 'visual')!;
  assert.equal(v.score, null);
  assert.ok(v.reason?.includes('housekeeping'));
});

test('overall is the weighted mean of scored dimensions and explains itself', () => {
  const rep = computeReport([
    out('knowledge.orphan', 'structure', 'knowledge', 'low', 0, 100),            // 100
    out('structure.link.broken', 'structure', 'structure', 'low', 15, 100),       // 0 (rate = tolerance)
  ], open, defaultScoring(), NOW);
  // vault weights: knowledge 20, structure 20, maintenance has no applicable metric
  assert.equal(Math.round(rep.overall.score!), 50);
  assert.ok(rep.overall.formula.includes('Knowledge 100'));
});

test('maintenance: review coverage and issue age come only from review state and first-seen', () => {
  const o = out('research.note.no-source', 'integrity', 'research', 'high', 10, 20);
  const ids = o.finding.items.map((i) => i.id);
  const day = 86_400_000;
  const view: RegistryView = {
    statusOf: (id): ItemStatus => (ids.slice(0, 5).includes(id) ? 'reviewed' : 'open'),
    firstSeen: (id) => (ids.slice(0, 2).includes(id) ? NOW - 40 * day : NOW - day),
  };
  const rep = computeReport([o], view, defaultScoring(), NOW);
  const cov = rep.metrics.find((m) => m.id === 'maintenance.review-coverage')!;
  assert.equal(cov.eligible, 10);
  assert.equal(cov.affected, 5);
  assert.equal(Math.round(cov.score!), 50);
  const age = rep.metrics.find((m) => m.id === 'maintenance.issue-age')!;
  assert.equal(age.affected, 2);
  assert.equal(rep.metrics.find((m) => m.id === 'maintenance.trend')!.status, 'not-applicable');
});

test('overrides change tolerance and weight', () => {
  const cfg = defaultScoring();
  cfg.overrides['knowledge.orphan'] = { tolerance: 0.5 };
  const m = computeReport([out('knowledge.orphan', 'structure', 'knowledge', 'low', 14, 212)], open, cfg, NOW).metrics.find((x) => x.id === 'knowledge.orphan')!;
  assert.equal(m.tolerance, 0.5);
  assert.ok(m.score! > 85);
});

test('ranking: integrity outranks structure outranks hygiene; ignored-only findings drop to the bottom group', () => {
  const ranked = rankFindings([
    out('hygiene.note.empty', 'hygiene', 'structure', 'info', 3, 10),
    out('knowledge.orphan', 'structure', 'knowledge', 'low', 3, 10, 'medium'),
    out('research.note.no-source', 'integrity', 'research', 'high', 1, 10),
    out('research.source.unreferenced', 'integrity', 'sources', 'medium', 1, 10),
  ], open, defaultScoring());
  assert.deepEqual(ranked.map((r) => r.finding.ruleId), [
    'research.note.no-source', 'research.source.unreferenced', 'knowledge.orphan', 'hygiene.note.empty',
  ]);
  assert.equal(ranked[0]?.priority, 9);
  assert.equal(ranked[1]?.priority, 6);
  assert.equal(ranked[2]?.priority, 4);
});

test('every metric id in the catalog is documented in docs/SCORING.md', async () => {
  const { METRICS } = await import('../src/scoring/metricDefs.ts');
  const { readFileSync } = await import('node:fs');
  const doc = readFileSync('docs/SCORING.md', 'utf8');
  for (const id of Object.keys(METRICS)) assert.ok(doc.includes('`' + id + '`'), `docs/SCORING.md is missing ${id}`);
});
