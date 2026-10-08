import { hasRole } from '../conventions/roles.ts';
import type { AnalysisConfig } from '../model/settings.ts';
import type { AssetFacts, NoteFacts, VaultSnapshot } from '../model/types.ts';
import { normTag } from '../util/normalize.ts';
import { buildGraph, type Graph } from './graph.ts';

export interface AnalysisContext {
  config: AnalysisConfig;
  /** Every note, including excluded ones (used for reference counting). */
  all: NoteFacts[];
  /** Notes subject to analysis (exclusions removed). */
  notes: NoteFacts[];
  assets: AssetFacts[];
  graph: Graph;
  byPath: Map<string, NoteFacts>;
  /** Every note including excluded ones (workspaces may contain notes from excluded folders). */
  allByPath: Map<string, NoteFacts>;
  research: NoteFacts[];
  sources: NoteFacts[];
  /** asset/note path -> paths of notes (any, including excluded) linking to it. */
  referencedBy: Map<string, Set<string>>;
}

export function isExcluded(n: Pick<NoteFacts, 'folder' | 'tags'>, cfg: Pick<AnalysisConfig, 'excludeFolders' | 'excludeTags'>): boolean {
  const folder = n.folder.toLowerCase();
  for (const f of cfg.excludeFolders) {
    const t = f.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
    if (t && (folder === t || folder.startsWith(t + '/'))) return true;
  }
  const tags = cfg.excludeTags.map(normTag).filter(Boolean);
  return n.tags.some((tag) => tags.some((x) => tag === x || tag.startsWith(x + '/')));
}

export function buildContext(snapshot: VaultSnapshot, config: AnalysisConfig): AnalysisContext {
  const notes = snapshot.notes.filter((n) => !isExcluded(n, config));
  const assets = snapshot.assets.filter((a) => !isExcluded({ folder: a.folder, tags: [] }, config));
  const referencedBy = new Map<string, Set<string>>();
  for (const n of snapshot.notes) {
    for (const t of n.links) {
      let s = referencedBy.get(t);
      if (!s) referencedBy.set(t, (s = new Set()));
      s.add(n.path);
    }
  }
  return {
    config,
    all: snapshot.notes,
    notes,
    assets,
    graph: buildGraph(notes),
    byPath: new Map(notes.map((n) => [n.path, n])),
    allByPath: new Map(snapshot.notes.map((n) => [n.path, n])),
    research: notes.filter((n) => hasRole(n, 'research')),
    sources: notes.filter((n) => hasRole(n, 'source')),
    referencedBy,
  };
}
