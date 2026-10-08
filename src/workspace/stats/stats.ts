import type { WorkspaceSources } from '../sources/sources.ts';
import type { LocalGraph } from '../graph/localGraph.ts';
import type { WorkspaceScope } from '../core/scope.ts';

export interface WorkspaceStats {
  members: number;
  missing: number;
  /** Distinct pairs of members linked in either direction. */
  internalConnections: number;
  /** Links from members to notes outside the workspace. */
  externalOut: number;
  /** Notes outside the workspace linking into members. */
  externalIn: number;
  /** Connected pairs ÷ possible pairs, 0..1. */
  density: number;
  clusters: number;
  isolated: number;
  largestClusterShare: number;
  researchNotes: number;
  sourced: number;
  sourcesAssociated: number;
  sourcesInWorkspace: number;
  openIssues: number;
}

export function computeWorkspaceStats(scope: WorkspaceScope, g: LocalGraph, s: WorkspaceSources, openIssues: number): WorkspaceStats {
  const n = scope.members.length;
  return {
    members: n,
    missing: scope.missing.length,
    internalConnections: g.totals.internalConnections,
    externalOut: g.totals.externalOut,
    externalIn: g.totals.externalIn,
    density: g.totals.density,
    clusters: g.clusters.length,
    isolated: g.isolated.length,
    largestClusterShare: n > 0 && g.clusters[0] ? g.clusters[0].members.length / n : 0,
    researchNotes: s.rows.stats.researchNotes,
    sourced: s.rows.stats.sourced,
    sourcesAssociated: s.sources.length,
    sourcesInWorkspace: s.sources.filter((x) => x.inWorkspace).length,
    openIssues,
  };
}
