import type { NoteFacts } from '../model/types.ts';

export interface Graph {
  paths: string[];
  index: Map<string, number>;
  /** Note -> note outgoing links (indices). */
  out: number[][];
  inn: number[][];
  /** Connected-component id per node (undirected). */
  comp: Int32Array;
  compSizes: number[];
  /** Id of the largest component. */
  mainComp: number;
}

/** Union-find with path halving: iterative, O(E α(V)), no recursion depth issues on huge vaults. */
export function makeUnionFind(n: number) {
  const parent = new Int32Array(n);
  const size = new Int32Array(n).fill(1);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x] as number] as number;
      x = parent[x] as number;
    }
    return x;
  };
  const union = (a: number, b: number) => {
    let ra = find(a);
    let rb = find(b);
    if (ra === rb) return;
    if ((size[ra] as number) < (size[rb] as number)) [ra, rb] = [rb, ra];
    parent[rb] = ra;
    size[ra] = (size[ra] as number) + (size[rb] as number);
  };
  return { find, union };
}

export function buildGraph(notes: readonly NoteFacts[]): Graph {
  const paths = notes.map((n) => n.path);
  const index = new Map<string, number>();
  paths.forEach((p, i) => index.set(p, i));
  const n = paths.length;
  const out: number[][] = Array.from({ length: n }, () => []);
  const inn: number[][] = Array.from({ length: n }, () => []);
  const uf = makeUnionFind(n);

  notes.forEach((note, i) => {
    for (const t of note.links) {
      const j = index.get(t);
      if (j === undefined || j === i) continue;
      (out[i] as number[]).push(j);
      (inn[j] as number[]).push(i);
      uf.union(i, j);
    }
  });

  const comp = new Int32Array(n);
  const rootToId = new Map<number, number>();
  const compSizes: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = uf.find(i);
    let id = rootToId.get(r);
    if (id === undefined) {
      id = compSizes.length;
      rootToId.set(r, id);
      compSizes.push(0);
    }
    comp[i] = id;
    compSizes[id] = (compSizes[id] as number) + 1;
  }
  let mainComp = 0;
  compSizes.forEach((s, id) => {
    if (s > (compSizes[mainComp] as number)) mainComp = id;
  });
  return { paths, index, out, inn, comp, compSizes, mainComp };
}

export function degree(g: Graph, i: number): number {
  return (g.out[i] as number[]).length + (g.inn[i] as number[]).length;
}
