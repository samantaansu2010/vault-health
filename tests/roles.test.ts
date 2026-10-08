import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignRoles, evalMatch, validateMatchExpr, validateRoles } from '../src/conventions/roles.ts';
import { extractBodySignals } from '../src/conventions/body.ts';
import { discoverConventions } from '../src/conventions/discovery.ts';
import { note } from './fixtures/vault.ts';

test('property, tag, folder, alias and filename matchers', () => {
  const n = note('Research/@smith2020.md', { props: { Type: ['[[Source]]'], year: 2020 }, tags: ['lit/review'], aliases: ['Smith 2020'] });
  assert.ok(evalMatch({ kind: 'property', key: 'type', op: 'equals', value: 'source' }, n), 'case-insensitive key, wikilink stripped');
  assert.ok(evalMatch({ kind: 'property', key: 'year', op: 'exists' }, n));
  assert.ok(evalMatch({ kind: 'tag', tag: '#lit' }, n), 'nested tag matches parent');
  assert.ok(!evalMatch({ kind: 'tag', tag: 'lit', includeNested: false }, n));
  assert.ok(evalMatch({ kind: 'folder', path: 'research' }, n));
  assert.ok(evalMatch({ kind: 'alias', pattern: 'Smith *' }, n));
  assert.ok(evalMatch({ kind: 'filename', pattern: '@*' }, n));
  assert.ok(!evalMatch({ kind: 'folder', path: 'Res' }, n), 'folder match is by path segment, not prefix text');
});

test('combinators: any / all / not', () => {
  const n = note('A.md', { tags: ['x'] });
  assert.ok(evalMatch({ any: [{ kind: 'tag', tag: 'y' }, { kind: 'tag', tag: 'x' }] }, n));
  assert.ok(!evalMatch({ all: [{ kind: 'tag', tag: 'y' }, { kind: 'tag', tag: 'x' }] }, n));
  assert.ok(evalMatch({ not: { kind: 'tag', tag: 'y' } }, n));
});

test('assignRoles counts matches per role', () => {
  const notes = [note('a.md', { tags: ['source'] }), note('b.md', { tags: ['source'] }), note('c.md')];
  const counts = assignRoles(notes, [{ id: 'source', label: 'S', match: { kind: 'tag', tag: 'source' } }]);
  assert.equal(counts.get('source'), 2);
  assert.deepEqual(notes[2]?.roles, []);
});

test('validation gives readable errors', () => {
  assert.equal(validateMatchExpr({ kind: 'tag', tag: 'x' }), null);
  assert.ok(validateMatchExpr({ kind: 'nope' })?.includes('unknown matcher'));
  assert.ok(validateRoles([{ id: 'a', label: 'A', match: { kind: 'tag', tag: 'x' } }, { id: 'a', label: 'B', match: { kind: 'tag', tag: 'y' } }])?.includes('duplicate'));
});

test('body signals: urls, footnotes, pandoc citekeys; code is ignored', () => {
  const s = extractBodySignals([
    'See https://example.org/paper. And [^1] plus [^note].',
    '[^1]: footnote text',
    'As argued [@smith2020, p. 4; @doe2019].',
    '```',
    'https://ignored.example/code',
    '```',
    'inline `https://ignored2.example` and mail me@example.com',
  ].join('\n'));
  assert.deepEqual(s.urls, ['https://example.org/paper']);
  assert.equal(s.footnotes, 2);
  assert.deepEqual(s.citekeys.sort(), ['doe2019', 'smith2020']);
});

test('discovery summarizes properties, tags, folders without configuring anything', () => {
  const d = discoverConventions([
    note('Sources/a.md', { props: { type: 'source' }, tags: ['t'] }),
    note('Sources/b.md', { props: { type: 'source' } }),
    note('x.md', { props: { type: 'research' } }),
  ]);
  assert.equal(d.properties[0]?.key, 'type');
  assert.equal(d.properties[0]?.topValues[0]?.value, 'source');
  assert.equal(d.folders[0]?.folder, 'Sources');
});
