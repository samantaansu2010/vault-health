import type { App } from 'obsidian';
import type { LocalGraph } from '../../workspace/graph/localGraph.ts';
import { selectGraphNodes } from '../../workspace/graph/localGraph.ts';
import { layoutGraph, type Layout } from '../../workspace/graph/layout.ts';
import { openPath } from '../common.ts';

export const MAX_GRAPH_NODES = 150;
const SVG = 'http://www.w3.org/2000/svg';
const W = 960;
const H = 560;

export interface GraphCache {
  key: string;
  nodes: number[];
  layout: Layout;
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Layout is computed once per distinct graph and reused across re-renders. */
export function getLayout(g: LocalGraph, prev: GraphCache | null): GraphCache {
  const key = `${g.members.join('|')}#${g.edges.length}`;
  if (prev && prev.key === key) return prev;
  const nodes = selectGraphNodes(g, MAX_GRAPH_NODES);
  const pos = new Map(nodes.map((n, i) => [n, i]));
  const edges: [number, number][] = [];
  for (const [a, b] of g.edges) {
    const i = pos.get(a);
    const j = pos.get(b);
    if (i !== undefined && j !== undefined) edges.push([i, j]);
  }
  return { key, nodes, layout: layoutGraph(nodes.length, edges) };
}

/**
 * The workspace-local graph: only member notes, and only links between them. Click or press Enter on a node
 * to open the note. Node size reflects internal connections; hollow nodes have none. A table of the same
 * information is always available in the Notes tab, so the picture is never the only way to see it.
 */
export function renderLocalGraph(
  parent: HTMLElement, app: App, g: LocalGraph, cache: GraphCache, focusCluster: number | null,
): void {
  const { nodes, layout } = cache;
  const pos = new Map(nodes.map((n, i) => [n, i]));
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': `Workspace graph of ${g.members.length} notes`, class: 'vh-graph' });
  const px = (i: number) => 30 + (layout.x[i] as number) * (W - 60);
  const py = (i: number) => 20 + (layout.y[i] as number) * (H - 40);
  const dim = (member: number) => focusCluster !== null && g.clusterOf[member] !== focusCluster;

  const seen = new Set<string>();
  for (const [a, b] of g.edges) {
    const i = pos.get(a);
    const j = pos.get(b);
    if (i === undefined || j === undefined) continue;
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(k)) continue;
    seen.add(k);
    root.appendChild(svg('line', {
      x1: px(i), y1: py(i), x2: px(j), y2: py(j), class: `vh-gedge${dim(a) || dim(b) ? ' dim' : ''}`,
    }));
  }
  const labelAll = nodes.length <= 40;
  nodes.forEach((member, i) => {
    const path = g.members[member] as string;
    const name = (path.split('/').pop() ?? path).replace(/\.md$/, '');
    const deg = g.internalDegree[member] as number;
    const r = 5 + Math.min(11, Math.sqrt(deg) * 2.2);
    const label = `${name}: ${deg} internal, ${g.externalOut[member]} outgoing and ${g.externalIn[member]} incoming external connections`;
    const grp = svg('g', {
      class: `vh-gnode${deg === 0 ? ' isolated' : ''}${dim(member) ? ' dim' : ''}`,
      tabindex: 0, role: 'link', 'aria-label': label, transform: `translate(${px(i)} ${py(i)})`,
    });
    grp.appendChild(svg('circle', { r }));
    const t = svg('title');
    t.textContent = label;
    grp.appendChild(t);
    if (labelAll || deg >= 3 || focusCluster === g.clusterOf[member]) {
      const text = svg('text', { x: r + 4, y: 4, class: 'vh-glabel' });
      text.textContent = name.length > 24 ? `${name.slice(0, 23)}…` : name;
      grp.appendChild(text);
    }
    grp.addEventListener('click', (e) => openPath(app, path, e.ctrlKey || e.metaKey));
    grp.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPath(app, path); } });
    root.appendChild(grp);
  });
  const wrap = parent.createDiv({ cls: 'vh-graphwrap' });
  wrap.appendChild(root);
  if (g.members.length > nodes.length) {
    wrap.createEl('p', { cls: 'vh-muted', text: `Drawing the ${nodes.length} most connected of ${g.members.length} notes; the Notes tab lists all of them.` });
  }
}
