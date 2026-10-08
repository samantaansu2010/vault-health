import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const FAKE_DTS = `
export class Vault {
    /** @since 1.6.1 */
    cachedRead(file: TFile): Promise<string>;
}
`;

test('check-api-since computes the max @since over used symbols and fails when the manifest is lower', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vh-'));
  const dts = join(dir, 'obsidian.d.ts');
  const srcDir = join(dir, 'src');
  const manifest = join(dir, 'manifest.json');

  mkdirSync(srcDir);

  writeFileSync(dts, FAKE_DTS);

  writeFileSync(
    join(srcDir, 'test.ts'),
    `import { Vault } from 'obsidian';`
  );

  writeFileSync(
    manifest,
    JSON.stringify({ minAppVersion: '1.4.0' })
  );

  let out = '';
  let failed = false;

  try {
    out = execFileSync(
      'node',
      ['scripts/check-api-since.mjs', dts, manifest, srcDir],
      { encoding: 'utf8' }
    );
  } catch (e) {
    failed = true;
    const err = e as { stdout?: string; stderr?: string };
    out = (err.stdout ?? '') + (err.stderr ?? '');
  }

  assert.ok(
    out.includes('Computed minimum Obsidian version: 1.6.1'),
    out
  );

  assert.ok(
    failed,
    'manifest 1.4.0 is lower than 1.6.1, so the check must fail'
  );

  assert.ok(out.includes('FAIL'), out);
});