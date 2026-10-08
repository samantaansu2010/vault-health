import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const all = files('src');
const text = (p: string) => readFileSync(p, 'utf8');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('pure layers never import obsidian (they must stay testable and API-agnostic)', () => {
  const pure = all.filter((p) =>
    /src[\\/](model|util|conventions|analysis|scoring|registry|workspace)[\\/]/.test(p) ||
    p.endsWith('settings/defaults.ts')
  );

  assert.ok(pure.length > 0, 'No pure-layer files were found');

  for (const p of pure) {
    assert.ok(
      !/from\s+['"]obsidian['"]/.test(text(p)),
      `${p} imports obsidian`
    );
  }
});

test('safety: nothing in src can modify, move, rename, delete or rewrite vault files', () => {
  const forbidden =
    /\b(vault\.(modify|create|createBinary|createFolder|delete|trash|rename|append|process|copy|modifyBinary)|fileManager\b|processFrontMatter|renameFile|trashFile|app\.vault\.adapter)/;

  for (const p of all) {
    assert.ok(
      !forbidden.test(stripComments(text(p))),
      `${p} uses a vault-mutating API`
    );
  }
});

test('privacy: no network access of any kind', () => {
  for (const p of all) {
    const code = stripComments(text(p));

    assert.ok(
      !/\b(fetch\s*\(|XMLHttpRequest|WebSocket|requestUrl|sendBeacon|EventSource)\b/.test(code),
      `${p} references a network API`
    );
  }
});

test('mobile: no regex lookbehind (unsupported in some mobile WebViews)', () => {
  for (const p of all) {
    assert.ok(
      !/\(\?<[=!]/.test(stripComments(text(p))),
      `${p} uses lookbehind`
    );
  }
});