import type { ConventionSet, ProvenanceConfig } from '../model/conventions.ts';

const provenance: ProvenanceConfig = {
  linkProps: ['source', 'sources', 'reference', 'references'],
  fileProps: ['file', 'pdf', 'attachment'],
  identityProps: ['url', 'link', 'doi', 'isbn', 'citekey', 'zotero'],
  bodyLinks: true,
  inlineUrls: true,
  footnotes: true,
  citekeys: true,
};

const noRequirement = { all: [], any: [] };

export const PRESETS: ConventionSet[] = [
  {
    id: 'props-or-tags',
    label: 'Properties or tags (default)',
    roles: [
      { id: 'research', label: 'Research note', match: { any: [
        { kind: 'property', key: 'type', op: 'equals', value: 'research' },
        { kind: 'tag', tag: 'research' },
      ] } },
      { id: 'source', label: 'Source note', match: { any: [
        { kind: 'property', key: 'type', op: 'equals', value: 'source' },
        { kind: 'tag', tag: 'source' },
      ] } },
      { id: 'artwork', label: 'Artwork record', match: { any: [
        { kind: 'property', key: 'type', op: 'equals', value: 'artwork' },
        { kind: 'tag', tag: 'artwork' },
      ] } },
    ],
    provenance,
    sourceRequirement: { all: [], any: ['url', 'doi', 'isbn', 'file', 'citekey'] },
    researchRequirement: noRequirement,
  },
  {
    id: 'tags',
    label: 'Tags only (#research, #source)',
    roles: [
      { id: 'research', label: 'Research note', match: { kind: 'tag', tag: 'research' } },
      { id: 'source', label: 'Source note', match: { kind: 'tag', tag: 'source' } },
      { id: 'artwork', label: 'Artwork record', match: { kind: 'tag', tag: 'artwork' } },
    ],
    provenance,
    sourceRequirement: { all: [], any: ['url', 'doi', 'isbn', 'file', 'citekey'] },
    researchRequirement: noRequirement,
  },
  {
    id: 'folders',
    label: 'Folders (Research/, Sources/)',
    roles: [
      { id: 'research', label: 'Research note', match: { kind: 'folder', path: 'Research' } },
      { id: 'source', label: 'Source note', match: { kind: 'folder', path: 'Sources' } },
      { id: 'artwork', label: 'Artwork record', match: { kind: 'folder', path: 'Artworks' } },
    ],
    provenance,
    sourceRequirement: { all: [], any: ['url', 'doi', 'isbn', 'file', 'citekey'] },
    researchRequirement: noRequirement,
  },
  {
    id: 'literature-notes',
    label: 'Literature notes (@citekey files, Zotero-style)',
    roles: [
      { id: 'research', label: 'Research note', match: { any: [
        { kind: 'folder', path: 'Research' },
        { kind: 'tag', tag: 'research' },
        { kind: 'property', key: 'type', op: 'equals', value: 'research' },
      ] } },
      { id: 'source', label: 'Source (literature) note', match: { any: [
        { kind: 'filename', pattern: '@*' },
        { kind: 'folder', path: 'Literature' },
        { kind: 'tag', tag: 'literature' },
        { kind: 'property', key: 'citekey', op: 'exists' },
      ] } },
      { id: 'artwork', label: 'Artwork record', match: { kind: 'property', key: 'type', op: 'equals', value: 'artwork' } },
    ],
    provenance,
    sourceRequirement: { all: [], any: ['url', 'doi', 'isbn', 'file', 'citekey'] },
    researchRequirement: noRequirement,
  },
  {
    id: 'custom',
    label: 'Custom (edit roles as JSON)',
    roles: [],
    provenance,
    sourceRequirement: { all: [], any: [] },
    researchRequirement: noRequirement,
  },
];

export function presetById(id: string): ConventionSet {
  return structuredCloneSafe(PRESETS.find((p) => p.id === id) ?? (PRESETS[0] as ConventionSet));
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
