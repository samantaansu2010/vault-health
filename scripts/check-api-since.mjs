#!/usr/bin/env node
// Computes the lowest Obsidian version compatible with the APIs this plugin uses, from the `@since`
// JSDoc tags in obsidian.d.ts, and compares it with manifest.json's minAppVersion.
//
//   node scripts/check-api-since.mjs node_modules/obsidian/obsidian.d.ts [--write]
//
// Two inputs decide "which APIs we use":
//   1. every name imported from 'obsidian' in src/**/*.ts (types and values), and
//   2. scripts/obsidian-members.txt: Container.member entries for members accessed through `app.*`
//      objects, which cannot be found by import scanning. Keep that file in sync when adding calls.
// Symbols without an @since tag are treated as "old" (before @since annotations existed).
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const dts = positional[0] ?? 'node_modules/obsidian/obsidian.d.ts';
const manifestPath = positional[1] ?? join(root, 'manifest.json');
const srcDir = positional[2] ?? join(root, 'src');
const write = args.includes('--write');

export function parseSince(text) {
  /** @type {Map<string, string>} */
  const since = new Map();
  const lines = text.split(/\r?\n/);
  let doc = null;           // @since of the pending JSDoc block
  let inDoc = false;
  let docBuf = [];
  let container = null;
  let depth = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('/**')) { inDoc = true; docBuf = []; }
    if (inDoc) {
      docBuf.push(t);
      if (t.includes('*/')) {
        inDoc = false;
        const m = /@since\s+([0-9]+(?:\.[0-9]+){0,2})/.exec(docBuf.join(' '));
        doc = m ? m[1] : null;
      }
      continue;
    }
    if (t === '' || t.startsWith('//')) continue;
    const decl = /^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(class|interface|function|type|const|enum|namespace)\s+([A-Za-z_$][\w$]*)/.exec(t);
    if (depth === 0 && decl) {
      const name = decl[2];
      if (decl[1] === 'class' || decl[1] === 'interface' || decl[1] === 'namespace' || decl[1] === 'enum') container = name;
      if (doc) since.set(name, doc);
    } else if (depth === 1 && container) {
      const mem = /^(?:(?:static|readonly|abstract|protected|private|public|get|set)\s+)*([A-Za-z_$][\w$]*)\??\s*[(:<]/.exec(t);
      if (mem && doc) since.set(`${container}.${mem[1]}`, doc);
    }
    doc = null;
    for (const ch of t) { if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) container = null; } }
  }
  return since;
}

export function cmp(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d) return d; }
  return 0;
}

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

export function importedNames(srcDir) {
  const names = new Set();
  for (const file of walk(srcDir)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]obsidian['"]/g)) {
      for (const part of m[1].split(',')) {
        const n = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
        if (n) names.add(n);
      }
    }
  }
  return names;
}

export function compute(dtsText, srcDir, membersText) {
  const since = parseSince(dtsText);
  const used = [...importedNames(srcDir)];
  for (const line of membersText.split(/\r?\n/)) {
    const l = line.replace(/#.*/, '').trim();
    if (l) used.push(l);
  }
  const rows = [];
  let max = '0.0.0';
  for (const name of used) {
    const v = since.get(name) ?? null;
    rows.push({ name, since: v });
    if (v && cmp(v, max) > 0) max = v;
  }
  return { rows, max, unknown: used.filter((n) => !since.has(n)) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!existsSync(dts)) {
    console.error(`Cannot find ${dts}. Run \`npm install\` first (the real obsidian typings are required; do not guess).`);
    process.exit(2);
  }
  const membersFile = join(root, 'scripts/obsidian-members.txt');
 const { rows, max, unknown } = compute(
  readFileSync(dts, 'utf8'),
  srcDir,
  existsSync(membersFile) ? readFileSync(membersFile, 'utf8') : ''
);
  console.log('API symbols with an @since tag (newest first):');
  for (const r of rows.filter((r) => r.since).sort((a, b) => cmp(b.since, a.since))) console.log(`  ${r.since.padEnd(8)} ${r.name}`);
  console.log(`\n${unknown.length} used symbol(s) have no @since tag (treated as predating @since annotations).`);
  console.log(`Computed minimum Obsidian version: ${max === '0.0.0' ? '(no @since-tagged API used)' : max}`);

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  console.log(`manifest.json minAppVersion:        ${manifest.minAppVersion}`);
  if (max !== '0.0.0' && cmp(manifest.minAppVersion, max) < 0) {
    console.error('\nFAIL: manifest.minAppVersion is lower than the APIs used require.');
    if (write) {
      manifest.minAppVersion = max;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
      writeFileSync(join(root, 'versions.json'), JSON.stringify({ ...JSON.parse(readFileSync(join(root, 'versions.json'), 'utf8')), [manifest.version]: max }, null, 2) + '\n');
      console.error(`Wrote minAppVersion ${max} to manifest.json and versions.json.`);
    } else process.exit(1);
  } else console.log('OK');
}
