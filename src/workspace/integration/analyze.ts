import type { AnalysisContext } from '../../analysis/context.ts';
import type { ProvenanceResult } from '../../analysis/research/provenance.ts';
import type { FindingItem, RuleOutput } from '../../model/types.ts';
import { resolveScope, type WorkspaceScope } from '../core/scope.ts';
import { findConnectedNotes, type ConnectedCandidate } from '../discovery/connected.ts';
import { suggestRelinks } from '../discovery/relink.ts';
import { workspaceRules } from '../diagnostics/rules.ts';
import { analyzeLocalGraph, type LocalGraph } from '../graph/localGraph.ts';
import type { WorkspaceDef } from '../model/types.ts';
import { analyzeWorkspaceSources, type WorkspaceSources } from '../sources/sources.ts';
import { computeWorkspaceStats, type WorkspaceStats } from '../stats/stats.ts';

export interface WorkspaceAnalysis {
  scope: WorkspaceScope;
  graph: LocalGraph;
  sources: WorkspaceSources;
  /** Workspace-level findings (registry-compatible, so Ignore / Mark reviewed work). */
  outputs: RuleOutput[];
  relinks: Map<string, string[]>;
  stats: WorkspaceStats;
}

export interface AnalyzeOptions {
  /** Open (non-ignored) vault-analysis findings per path. */
  issueCount: (path: string) => number;
  /** Ignored status lookup so workspace stats count only open issues. */
  isIgnored?: (item: FindingItem) => boolean;
}

/**
 * The integration seam:
 *   vault research analysis (provenance, findings)  →  workspace scope  →  workspace views.
 * The workspace chooses WHICH notes are in scope; all research analysis is reused, not reimplemented.
 */
export function analyzeWorkspace(ctx: AnalysisContext, prov: ProvenanceResult, def: WorkspaceDef, opts: AnalyzeOptions): WorkspaceAnalysis {
  const scope = resolveScope(def, (p) => ctx.allByPath.has(p));
  const graph = analyzeLocalGraph(ctx, scope.members);
  const sources = analyzeWorkspaceSources(ctx, prov, scope, opts.issueCount);
  const relinks = suggestRelinks(ctx, scope);
  const outputs = workspaceRules(scope, graph, relinks);
  const own = outputs.reduce((a, o) => a + o.finding.items.filter((i) => !(opts.isIgnored?.(i) ?? false)).length, 0);
  const vault = scope.members.reduce((a, p) => a + opts.issueCount(p), 0);
  return { scope, graph, sources, outputs, relinks, stats: computeWorkspaceStats(scope, graph, sources, own + vault) };
}

export function connectedFor(ctx: AnalysisContext, a: WorkspaceAnalysis, minConnections: number): ConnectedCandidate[] {
  return findConnectedNotes(ctx, a.scope, { minConnections });
}

/** Filter that keeps only vault-analysis items touching the workspace's member notes. */
export function memberItemFilter(scope: WorkspaceScope): (item: FindingItem) => boolean {
  return (item) => item.paths.some((p) => scope.memberSet.has(p));
}
