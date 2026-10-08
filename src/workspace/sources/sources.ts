import type { AnalysisContext } from '../../analysis/context.ts';
import type { ProvenanceResult } from '../../analysis/research/provenance.ts';
import { buildResearchRows, type ResearchRows, type SourceRow } from '../../analysis/research/rows.ts';
import type { WorkspaceScope } from '../core/scope.ts';

export interface WorkspaceSourceRow extends SourceRow {
  /** True when the source note is itself a member of the workspace. */
  inWorkspace: boolean;
  /** Members that cite it (link to it or point at it from a source property). */
  citedByMembers: string[];
}

export interface WorkspaceSources {
  /** Provenance rows for member research notes. */
  rows: ResearchRows;
  /** Sources that are members, or cited by members. */
  sources: WorkspaceSourceRow[];
  /** Research members with no recorded source of any kind. */
  unsourcedMembers: string[];
}

/**
 * "Sources associated with the workspace": member source notes plus any source note a member cites.
 * Reuses the vault-wide provenance analysis; the workspace only decides WHICH notes are in scope.
 */
export function analyzeWorkspaceSources(
  ctx: AnalysisContext,
  prov: ProvenanceResult,
  scope: WorkspaceScope,
  issueCount: (path: string) => number,
): WorkspaceSources {
  const cited = new Map<string, Set<string>>();
  for (const m of scope.members) {
    const p = prov.research.get(m);
    const targets = new Set<string>(p?.sourceTargets ?? []);
    for (const t of ctx.allByPath.get(m)?.links ?? []) if (prov.sources.has(t)) targets.add(t);
    for (const t of targets) {
      if (!prov.sources.has(t)) continue;
      let s = cited.get(t);
      if (!s) cited.set(t, (s = new Set()));
      s.add(m);
    }
  }
  const scopePaths = new Set<string>([...scope.members, ...cited.keys()]);
  const all = buildResearchRows(ctx, prov, scopePaths, issueCount);
  const memberNotes = all.notes.filter((r) => scope.memberSet.has(r.path));
  const noteStats = buildResearchRows(ctx, prov, scope.members, issueCount).stats;
  const sources: WorkspaceSourceRow[] = all.sources.map((s) => ({
    ...s,
    inWorkspace: scope.memberSet.has(s.path),
    citedByMembers: [...(cited.get(s.path) ?? [])].sort(),
  }));
  return {
    rows: { notes: memberNotes, sources: all.sources, stats: { ...all.stats, researchNotes: noteStats.researchNotes, sourced: noteStats.sourced, unsourced: noteStats.unsourced, citationOnly: noteStats.citationOnly, brokenOnly: noteStats.brokenOnly } },
    sources,
    unsourcedMembers: memberNotes.filter((r) => r.status === 'unsourced').map((r) => r.path),
  };
}
