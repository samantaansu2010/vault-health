import { hasRole } from '../../conventions/roles.ts';
import type { AnalysisContext } from '../context.ts';
import { makeUnionFind } from '../graph.ts';
import type { ProvenanceResult } from './provenance.ts';
import { buildResearchRows, emptyResearchStats, type ResearchNoteRow, type ResearchStats, type SourceRow } from './rows.ts';

export const STANDALONE_ID = '__standalone__';

export interface ResearchArea {
  id: string;
  label: string;
  hub: string | null;
  notes: ResearchNoteRow[];
  sources: SourceRow[];
  stats: ResearchStats;
}

export interface ResearchAreasData {
  areas: ResearchArea[];
  totals: ResearchStats;
}

/**
 * Research AREAS are an automatic analysis lens: connected groups of research/source notes (links among
 * role notes only). They are NOT user-created Research Workspaces (see src/workspace). Role notes with no
 * link to another role note are collected in one "standalone" bucket.
 */
export function buildResearchAreas(
  ctx: AnalysisContext,
  prov: ProvenanceResult,
  issueCount: (path: string) => number,
): ResearchAreasData {
  const roleNotes = ctx.notes.filter((n) => hasRole(n, 'research') || hasRole(n, 'source'));
  const idx = new Map<string, number>();
  roleNotes.forEach((n, i) => idx.set(n.path, i));
  const uf = makeUnionFind(roleNotes.length);
  const localDegree = new Int32Array(roleNotes.length);
  roleNotes.forEach((n, i) => {
    for (const t of n.links) {
      const j = idx.get(t);
      if (j === undefined || j === i) continue;
      uf.union(i, j);
      localDegree[i] = (localDegree[i] as number) + 1;
      localDegree[j] = (localDegree[j] as number) + 1;
    }
  });
  const groups = new Map<number, number[]>();
  roleNotes.forEach((_, i) => {
    const r = uf.find(i);
    let g = groups.get(r);
    if (!g) groups.set(r, (g = []));
    g.push(i);
  });

  const areas: ResearchArea[] = [];
  const standalone: number[] = [];
  const make = (members: number[], isStandalone: boolean): ResearchArea => {
    let hub: number | null = null;
    if (!isStandalone) {
      for (const i of members) {
        if (hub === null || (localDegree[i] as number) > (localDegree[hub] as number) ||
          ((localDegree[i] as number) === (localDegree[hub] as number) && roleNotes[i]!.path < roleNotes[hub]!.path)) hub = i;
      }
    }
    const rows = buildResearchRows(ctx, prov, members.map((i) => roleNotes[i]!.path), issueCount);
    const hubPath = hub === null ? null : roleNotes[hub]!.path;
    const hubTitle = hubPath ? (ctx.allByPath.get(hubPath)?.basename ?? hubPath) : '';
    return {
      id: isStandalone ? STANDALONE_ID : `area:${hubPath}`,
      label: isStandalone ? 'Standalone notes (not linked to other research or source notes)' : `Area around “${hubTitle}”`,
      hub: hubPath,
      ...rows,
    };
  };
  for (const members of groups.values()) {
    if (members.length < 2) standalone.push(...members);
    else areas.push(make(members, false));
  }
  if (standalone.length > 0) areas.push(make(standalone, true));

  areas.sort((a, b) => {
    if (a.id === STANDALONE_ID) return 1;
    if (b.id === STANDALONE_ID) return -1;
    return b.stats.issues - a.stats.issues || (b.stats.researchNotes + b.stats.sources) - (a.stats.researchNotes + a.stats.sources);
  });
  const totals = emptyResearchStats();
  for (const a of areas) for (const k of Object.keys(totals) as (keyof ResearchStats)[]) totals[k] += a.stats[k];
  return { areas, totals };
}
