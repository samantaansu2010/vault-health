import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forEachChunked } from '../src/util/chunk.ts';

test('yields when the time budget is exceeded and reports progress', async () => {
  let t = 0;
  let yields = 0;
  const seen: number[] = [];
  const ok = await forEachChunked(
    Array.from({ length: 10 }, (_, i) => i),
    (i) => { seen.push(i); t += 5; },
    { budgetMs: 12, now: () => t, yieldFn: async () => { yields++; }, onProgress: () => {} },
  );
  assert.equal(ok, true);
  assert.equal(seen.length, 10);
  assert.ok(yields >= 3, `expected several yields, got ${yields}`);
});

test('stops promptly when cancelled', async () => {
  let n = 0;
  const ok = await forEachChunked([1, 2, 3, 4, 5], () => { n++; }, { isCancelled: () => n >= 2 });
  assert.equal(ok, false);
  assert.equal(n, 2);
});
