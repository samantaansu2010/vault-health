import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { config } from './fixtures/vault.ts';

register('./fixtures/obsidian-hooks.mjs', import.meta.url);
const { VaultScanner } = await import('../src/index/VaultScanner.ts');

interface FakeFile { path: string; name: string; basename: string; extension: string; stat: { size: number; mtime: number; ctime: number }; parent: null }
const mk = (path: string, size = 100): FakeFile => {
  const name = path.split('/').pop() as string;
  const ext = name.includes('.') ? (name.split('.').pop() as string) : '';
  return { path, name, basename: name.replace(/\.[^.]+$/, ''), extension: ext, stat: { size, mtime: 5, ctime: 1 }, parent: null };
};

function fakeApp() {
  const notes = [mk('Research/r1.md', 400), mk('plain.md', 300), mk('blank.md', 40)];
  const files = [...notes, mk('img/pic.png', 9000), mk('docs/paper.pdf', 123456), mk('clip.mp4', 5)];
  const byName = new Map(files.map((f) => [f.name.replace(/\.md$/, ''), f]));
  const caches: Record<string, unknown> = {
    'Research/r1.md': {
      frontmatter: { type: 'research', source: '[[Smith 2020]]', file: '[[missing.pdf]]', tags: ['lit'], position: {} },
      frontmatterPosition: { start: { offset: 0 }, end: { offset: 12 } },
      embeds: [{ link: 'pic.png' }, { link: 'gone.png' }],
      tags: [{ tag: '#Inline' }],
    },
    'plain.md': { links: [{ link: 'Nowhere' }] },
    'blank.md': { frontmatter: { a: 1, position: {} }, frontmatterPosition: { start: { offset: 0 }, end: { offset: 39 } } },
  };
  const reads: string[] = [];
  const app = {
    vault: {
      getMarkdownFiles: () => notes,
      getFiles: () => files,
      cachedRead: async (f: FakeFile) => { reads.push(f.path); return '---\nfm\n---\nSee https://example.org/a and [^1].'; },
    },
    metadataCache: {
      resolvedLinks: { 'Research/r1.md': { 'img/pic.png': 1, 'plain.md': 1, 'Research/r1.md': 1 }, 'plain.md': {}, 'blank.md': {} } as Record<string, Record<string, number>>,
      unresolvedLinks: { 'Research/r1.md': { 'gone.png': 1 }, 'plain.md': { Nowhere: 1 }, 'blank.md': {} } as Record<string, Record<string, number>>,
      getFileCache: (f: FakeFile) => caches[f.path] ?? null,
      getFirstLinkpathDest: (link: string) => {
        if (link === 'Smith 2020') return mk('Sources/Smith 2020.md');
        return byName.get(link.replace(/\.md$/, '')) ?? null;
      },
    },
  };
  return { app, reads };
}

const opts = { budgetMs: 1000, scanBodies: true, isCancelled: () => false, onProgress: () => {} };

test('scanner builds facts from the metadata cache: links, embeds, props, tags, empties', async () => {
  const { app } = fakeApp();
  const snap = await new VaultScanner(app as never).scan(config(), opts);
  assert.ok(snap);
  const r1 = snap.notes.find((n) => n.path === 'Research/r1.md')!;
  assert.deepEqual(r1.links.sort(), ['Sources/Smith 2020.md', 'img/pic.png', 'plain.md']);
  assert.equal(r1.links.includes('Research/r1.md'), false, 'self links removed');
  assert.deepEqual(r1.embeds, [{ raw: 'pic.png', target: 'img/pic.png' }, { raw: 'gone.png', target: null }]);
  assert.deepEqual(r1.unresolved, [], 'a broken embed is not double-counted as a broken link');
  assert.deepEqual(r1.propLinks.map((p) => [p.key, p.target]), [['source', 'Sources/Smith 2020.md'], ['file', null]]);
  assert.deepEqual(r1.tags.sort(), ['inline', 'lit']);
  assert.ok(!('position' in r1.props));
  assert.deepEqual(r1.roles, ['research']);
  assert.deepEqual(snap.notes.find((n) => n.path === 'plain.md')!.unresolved, ['Nowhere']);
  assert.equal(snap.notes.find((n) => n.path === 'blank.md')!.empty, true);
  assert.equal(snap.notes.find((n) => n.path === 'plain.md')!.empty, false);
});

test('scanner lists attachments with kinds', async () => {
  const { app } = fakeApp();
  const snap = await new VaultScanner(app as never).scan(config(), opts);
  assert.deepEqual(snap!.assets.map((a) => [a.path, a.kind]).sort(), [['clip.mp4', 'video'], ['docs/paper.pdf', 'pdf'], ['img/pic.png', 'image']]);
});

test('bodies are read only for research/source notes, and cached by mtime+size', async () => {
  const { app, reads } = fakeApp();
  const sc = new VaultScanner(app as never);
  const s1 = await sc.scan(config(), opts);
  assert.deepEqual(reads, ['Research/r1.md']);
  assert.deepEqual(s1!.notes.find((n) => n.path === 'Research/r1.md')!.body, { urls: ['https://example.org/a'], footnotes: 1, citekeys: [] });
  await sc.scan(config(), opts);
  assert.equal(reads.length, 1, 'second scan reuses the cached body signals');
  const off = await new VaultScanner(app as never).scan(config(), { ...opts, scanBodies: false });
  assert.equal(off!.notes.find((n) => n.path === 'Research/r1.md')!.body, undefined);
});

test('scan returns null when cancelled', async () => {
  const { app } = fakeApp();
  assert.equal(await new VaultScanner(app as never).scan(config(), { ...opts, isCancelled: () => true }), null);
});
