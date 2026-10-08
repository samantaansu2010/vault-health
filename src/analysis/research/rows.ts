import type { AnalysisContext } from '../context.ts';
import type { NoteProvenance, ProvenanceResult, ProvenanceStatus } from './provenance.ts';

export interface ResearchNoteRow {
  path: string;
  title: string;
  status: ProvenanceStatus;
  sources: string[];
  brokenSources: string[];
  signals: NoteProvenance['signals'];
  inbound: number;
  outbound: number;
  issues: number;
}

export interface SourceRow {
  path: string;
  title: string;
  referencedBy: string[];
  otherInbound: number;
  identity: string[];
  missing: string[];
  issues: number;
}

export interface ResearchStats {
  researchNotes: number;
  sources: number;
  sourced: number;
  unsourced: number;
  citationOnly: number;
  brokenOnly: number;
  unreferencedSources: number;
  issues: number;
}

export interface ResearchRows {
  notes: ResearchNoteRow[];
  sources: SourceRow[];
  stats: ResearchStats;
}

export const emptyResearchStats = (): ResearchStats => ({
  researchNotes: 0, sources: 0, sourced: 0, unsourced: 0, citationOnly: 0, brokenOnly: 0, unreferencedSources: 0, issues: 0,
});

/**
 * The shared research-analysis primitive: provenance rows for any chosen set of notes.
 * Used by the automatic "research areas" analysis AND by user-created Research Workspaces.
 * Paths that are neither research nor source notes are ignored.
 */
export function buildResearchRows(
  ctx: AnalysisContext,
  prov: ProvenanceResult,
  paths: Iterable<string>,
  issueCount: (path: string) => number,
): ResearchRows {
  const stats = emptyResearchStats();
  const notes: ResearchNoteRow[] = [];
  const sources: SourceRow[] = [];
  const title = (p: string) => ctx.allByPath.get(p)?.basename ?? p;
  for (const path of paths) {
    const note = ctx.allByPath.get(path);
    if (!note) continue;
    const issues = issueCount(path);
    const p = prov.research.get(path);
    if (p) {
      stats.researchNotes++;
      stats.issues += issues;
      if (p.status === 'sourced') stats.sourced++;
      else if (p.status === 'unsourced') stats.unsourced++;
      else if (p.status === 'citation-only') stats.citationOnly++;
      else stats.brokenOnly++;
      notes.push({
        path, title: title(path), status: p.status, sources: p.sourceTargets,
        brokenSources: p.brokenPointers.map((b) => b.raw), signals: p.signals,
        inbound: ctx.referencedBy.get(path)?.size ?? 0, outbound: note.links.length, issues,
      });
    }
    const s = prov.sources.get(path);
    if (s) {
      stats.sources++;
      if (!p) stats.issues += issues;
      if (s.referencedBy.length === 0) stats.unreferencedSources++;
      sources.push({
        path, title: title(path), referencedBy: s.referencedBy, otherInbound: s.otherInbound,
        identity: s.identity.map((x) => `${x.kind}: ${x.value}`), missing: s.missing, issues,
      });
    }
  }
  const byIssues = <T extends { issues: number; title: string }>(a: T, b: T) => b.issues - a.issues || a.title.localeCompare(b.title);
  notes.sort(byIssues);
  sources.sort(byIssues);
  return { notes, sources, stats };
}
