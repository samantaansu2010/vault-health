import type { AnalysisContext } from '../../analysis/context.ts';
import { makeUnionFind } from '../../analysis/graph.ts';

export interface LocalCluster {
  id: number;
  /** Indices into LocalGraph.members. */
  members: number[];
  /** Most internally connected member (ties: first by path). */
  hub: number;
  /** Distinct internal connections between members of this cluster. */
  connections: number;
}

export interface LocalGraph {
  members: string[];
  /** Directed internal links as [from, to] member indices (a note linking to another note in the workspace). */
  edges: [number, number][];
  /** Distinct internal neighbours (either direction), per member. */
  internalDegree: number[];
  internalOut: number[];
  internalIn: number[];
  /** Links from this member to notes outside the workspace (notes in excluded folders are not counted). */
  externalOut: number[];
  /** Notes outside the workspace that link to this member. */
  externalIn: number[];
  /** Connected groups of 2+ members, largest first. */
  clusters: LocalCluster[];
  /** Members with no internal connection at all. */
  isolated: number[];
  clusterOf: Int32Array;
  totals: { internalConnections: number; externalOut: number; externalIn: number; density: number };
}

/**
 * Structure of the workspace taken on its own: only links between member notes count as "internal".
 * Everything else a member links to, or is linked from, is "external". Deterministic and read-only.
 */
export function analyzeLocalGraph(ctx: AnalysisContext, members: readonly string[]): LocalGraph {
  const n = members.length;
  const index = new Map<string, number>();
  members.forEach((p, i) => index.set(p, i));
  const edges: [number, number][] = [];
  const outN = Array.from({ length: n }, () => new Set<number>());
  const inN = Array.from({ length: n }, () => new Set<number>());
  const externalOut = new Array<number>(n).fill(0);
  const externalIn = new Array<number>(n).fill(0);
  const uf = makeUnionFind(n);

  members.forEach((path, i) => {
    const note = ctx.allByPath.get(path);
    if (note) {
      for (const t of note.links) {
        if (t === path) continue;
        const j = index.get(t);
        if (j !== undefined) {
          edges.push([i, j]);
          outN[i]!.add(j);
          inN[j]!.add(i);
          uf.union(i, j);
        } else if (ctx.byPath.has(t)) {
          externalOut[i] = (externalOut[i] as number) + 1;
        }
      }
    }
    for (const p of ctx.referencedBy.get(path) ?? []) {
      if (p !== path && !index.has(p) && ctx.byPath.has(p)) externalIn[i] = (externalIn[i] as number) + 1;
    }
  });

  const neighbours = members.map((_, i) => new Set<number>([...outN[i]!, ...inN[i]!]));
  const internalDegree = neighbours.map((s) => s.size);
  const groups = new Map<number, number[]>();
  members.forEach((_, i) => {
    const r = uf.find(i);
    let g = groups.get(r);
    if (!g) groups.set(r, (g = []));
    g.push(i);
  });
  const clusters: LocalCluster[] = [];
  const isolated: number[] = [];
  const clusterOf = new Int32Array(n).fill(-1);
  for (const g of groups.values()) {
    if (g.length === 1) {
      isolated.push(g[0] as number);
      continue;
    }
    const hub = g.reduce((best, i) => {
      const d = internalDegree[i] as number;
      const bd = internalDegree[best] as number;
      return d > bd || (d === bd && (members[i] as string) < (members[best] as string)) ? i : best;
    }, g[0] as number);
    let pairs = 0;
    for (const i of g) pairs += internalDegree[i] as number;
    clusters.push({ id: -1, members: g, hub, connections: pairs / 2 });
  }
  clusters.sort((a, b) => b.members.length - a.members.length || (members[a.hub] as string).localeCompare(members[b.hub] as string));
  clusters.forEach((c, k) => {
    c.id = k;
    for (const i of c.members) clusterOf[i] = k;
  });
  isolated.sort((a, b) => a - b);

  const connections = internalDegree.reduce((a, b) => a + b, 0) / 2;
  const possible = (n * (n - 1)) / 2;
  return {
    members: [...members],
    edges,
    internalDegree,
    internalOut: outN.map((s) => s.size),
    internalIn: inN.map((s) => s.size),
    externalOut,
    externalIn,
    clusters,
    isolated,
    clusterOf,
    totals: {
      internalConnections: connections,
      externalOut: externalOut.reduce((a, b) => a + b, 0),
      externalIn: externalIn.reduce((a, b) => a + b, 0),
      density: possible > 0 ? connections / possible : 0,
    },
  };
}

/** For drawing: the most internally connected members, capped so layout stays fast on any device. */
export function selectGraphNodes(g: LocalGraph, max: number): number[] {
  const all = g.members.map((_, i) => i);
  if (all.length <= max) return all;
  return all
    .sort((a, b) => (g.internalDegree[b] as number) - (g.internalDegree[a] as number) || a - b)
    .slice(0, max)
    .sort((a, b) => a - b);
}
