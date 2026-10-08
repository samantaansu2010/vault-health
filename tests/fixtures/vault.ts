import { assignRoles } from '../../src/conventions/roles.ts';
import { presetById } from '../../src/conventions/presets.ts';
import { defaultSettings } from '../../src/settings/defaults.ts';
import type { AnalysisConfig } from '../../src/model/settings.ts';
import type { AssetFacts, NoteFacts, VaultSnapshot } from '../../src/model/types.ts';

export function note(path: string, over: Partial<NoteFacts> = {}): NoteFacts {
  const base = path.split('/').pop() as string;
  return {
    path,
    basename: base.replace(/\.md$/, ''),
    folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
    mtime: 1000,
    size: 2000,
    links: [],
    unresolved: [],
    embeds: [],
    propLinks: [],
    tags: [],
    aliases: [],
    props: {},
    empty: false,
    roles: [],
    ...over,
  };
}

export function asset(path: string, kind: AssetFacts['kind'] = 'image', size = 1000): AssetFacts {
  const name = path.split('/').pop() as string;
  return {
    path, name, ext: name.split('.').pop() as string, kind, size, mtime: 1,
    folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
  };
}

export function config(over: Partial<AnalysisConfig> = {}): AnalysisConfig {
  return { ...defaultSettings().analysis, conventions: presetById('props-or-tags'), ...over };
}

export function snapshot(notes: NoteFacts[], assets: AssetFacts[] = [], cfg: AnalysisConfig = config()): VaultSnapshot {
  assignRoles(notes, cfg.conventions.roles);
  return { notes, assets, takenAt: 0 };
}

/** Deterministic synthetic vault for scale tests. */
export function bigVault(n: number): NoteFacts[] {
  const notes: NoteFacts[] = [];
  let seed = 42;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < n; i++) {
    const role = i % 20 === 0 ? { type: 'source', url: `https://example.org/s/${i}` } : i % 7 === 0 ? { type: 'research' } : {};
    notes.push(note(`f${i % 50}/n${i}.md`, { props: role, tags: i % 11 === 0 ? [`t${i % 300}`] : [], size: 500 + Math.floor(rnd() * 4000) }));
  }
  for (let i = 0; i < n; i++) {
    const k = 1 + Math.floor(rnd() * 8);
    const targets = new Set<string>();
    for (let j = 0; j < k && rnd() > 0.15; j++) targets.add((notes[Math.floor(rnd() * n)] as NoteFacts).path);
    targets.delete((notes[i] as NoteFacts).path);
    (notes[i] as NoteFacts).links = [...targets];
  }
  return notes;
}
