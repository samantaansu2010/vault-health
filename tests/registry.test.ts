import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IssueRegistry } from '../src/registry/IssueRegistry.ts';
import { makeItem, output } from '../src/analysis/items.ts';
import type { RuleOutput } from '../src/model/types.ts';

function rule(paths: string[], severity: 'high' | 'low' = 'high'): RuleOutput {
  const items = paths.map((p) => makeItem('r.x', [p], 'why', [], { severity }));
  return output({ ruleId: 'r.x', tier: 'integrity', dimension: 'research', severity, title: 't', description: '', suggestion: '' }, items, 10);
}

test('first-seen is recorded for high/medium items only', () => {
  let t = 1000;
  const reg = new IssueRegistry({}, () => t);
  const hi = rule(['a.md']);
  const lo = rule(['b.md'], 'low');
  reg.sync([hi, lo], () => 1);
  assert.equal(reg.firstSeen(hi.finding.items[0]!.id), 1000);
  assert.equal(reg.firstSeen(lo.finding.items[0]!.id), undefined);
  t = 5000;
  reg.sync([hi], () => 1);
  assert.equal(reg.firstSeen(hi.finding.items[0]!.id), 1000, 'first-seen survives later scans');
});

test('ignore persists across scans, can be restored, and low items can be ignored too', () => {
  const reg = new IssueRegistry({}, () => 1);
  const lo = rule(['b.md'], 'low');
  reg.sync([lo], () => 1);
  reg.ignore('r.x', lo.finding.items[0]!, 'intentional');
  reg.sync([lo], () => 1);
  assert.equal(reg.statusOf(lo.finding.items[0]!.id), 'ignored');
  assert.equal(reg.ignoredStates().length, 1);
  reg.restore(lo.finding.items[0]!.id);
  assert.equal(reg.statusOf(lo.finding.items[0]!.id), 'open');
});

test('reviewed expires when the file changes', () => {
  const reg = new IssueRegistry({}, () => 1);
  const o = rule(['a.md']);
  const item = o.finding.items[0]!;
  reg.sync([o], () => 100);
  reg.review('r.x', item, () => 100);
  reg.sync([o], () => 100);
  assert.equal(reg.statusOf(item.id), 'reviewed');
  reg.sync([o], () => 200);
  assert.equal(reg.statusOf(item.id), 'open');
});

test('open entries vanish when the issue is gone; ignored survive until stale', () => {
  let t = 0;
  const reg = new IssueRegistry({}, () => t);
  const o = rule(['a.md', 'b.md']);
  reg.sync([o], () => 1);
  reg.ignore('r.x', o.finding.items[1]!);
  t = 86_400_000;
  reg.sync([], () => 1);
  assert.equal(reg.firstSeen(o.finding.items[0]!.id), undefined);
  assert.equal(reg.statusOf(o.finding.items[1]!.id), 'ignored');
  t = 100 * 86_400_000;
  reg.sync([], () => 1);
  assert.equal(reg.ignoredStates().length, 0);
});

test('rename migration keeps decisions attached to the renamed note', () => {
  const reg = new IssueRegistry({}, () => 1);
  const o = rule(['old.md']);
  reg.sync([o], () => 1);
  reg.ignore('r.x', o.finding.items[0]!);
  reg.migrateRename('old.md', 'new.md');
  const renamed = rule(['new.md']);
  assert.equal(reg.statusOf(renamed.finding.items[0]!.id), 'ignored');
  assert.equal(reg.statusOf(o.finding.items[0]!.id), 'open');
});

test('round-trips through JSON', () => {
  const reg = new IssueRegistry({}, () => 1);
  const o = rule(['a.md']);
  reg.sync([o], () => 1);
  reg.ignore('r.x', o.finding.items[0]!);
  const again = new IssueRegistry(JSON.parse(JSON.stringify(reg.toJSON())));
  assert.equal(again.statusOf(o.finding.items[0]!.id), 'ignored');
});
