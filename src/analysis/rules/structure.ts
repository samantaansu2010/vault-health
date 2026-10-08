import { hasRole } from '../../conventions/roles.ts';
import type { FindingItem, RuleOutput } from '../../model/types.ts';
import type { AnalysisContext } from '../context.ts';
import { degree } from '../graph.ts';
import { makeItem, output } from '../items.ts';

export function brokenLinks(ctx: AnalysisContext): RuleOutput {
  const ruleId = 'structure.link.broken';
  let totalLinks = 0;
  const items: FindingItem[] = [];
  for (const n of ctx.notes) {
    for (const t of n.links) if (ctx.byPath.has(t)) totalLinks++;
    totalLinks += n.unresolved.length;
    if (n.unresolved.length === 0) continue;
    const roleNote = hasRole(n, 'research') || hasRole(n, 'source');
    const shown = n.unresolved.slice(0, 8);
    items.push(
      makeItem(
        ruleId,
        [n.path],
        `${n.unresolved.length} link${n.unresolved.length === 1 ? '' : 's'} in this note point to notes that do not exist.`,
        [
          ...shown.map((u) => ({ label: 'Unresolved link', value: u })),
          ...(n.unresolved.length > shown.length ? [{ label: 'More', value: `${n.unresolved.length - shown.length} not shown` }] : []),
        ],
        { units: n.unresolved.length, severity: roleNote ? 'medium' : 'low' },
      ),
    );
  }
  return output(
    {
      ruleId, tier: 'structure', dimension: 'structure', severity: 'low',
      title: 'Broken links',
      description: 'Links whose target note does not exist. Obsidian allows these as placeholders for future notes, so many are intentional; they are weighted gently and higher inside research and source notes.',
      suggestion: 'Worth checking whether each target was renamed, deleted, or is a deliberate placeholder.',
    },
    items,
    totalLinks,
  );
}

export function orphanNotes(ctx: AnalysisContext): RuleOutput {
  const ruleId = 'knowledge.orphan';
  const g = ctx.graph;
  const items: FindingItem[] = [];
  let eligible = 0;
  ctx.notes.forEach((n, i) => {
    if (hasRole(n, 'research') || hasRole(n, 'source') || n.empty) return;
    eligible++;
    if (degree(g, i) !== 0) return;
    items.push(
      makeItem(
        ruleId,
        [n.path],
        'This note has no links to, and no backlinks from, any other note.',
        [
          { label: 'Outgoing note links', value: 0 },
          { label: 'Backlinks', value: 0 },
          { label: 'Unresolved links', value: n.unresolved.length },
          { label: 'Size', value: `${n.size} bytes` },
        ],
        { severity: n.size >= 1500 ? 'medium' : 'low' },
      ),
    );
  });
  return output(
    {
      ruleId, tier: 'structure', dimension: 'knowledge', severity: 'low',
      title: 'Orphan notes',
      description: 'Notes with no links in either direction. Research and source notes are reported separately under research integrity; empty notes under housekeeping. Substantial orphans rank above short ones.',
      suggestion: 'Worth considering where each note belongs in your existing structure, or whether it is intentionally standalone.',
    },
    items,
    eligible,
  );
}

export function deadEndNotes(ctx: AnalysisContext): RuleOutput {
  const ruleId = 'knowledge.dead-end';
  const g = ctx.graph;
  const items: FindingItem[] = [];
  let eligible = 0;
  ctx.notes.forEach((n, i) => {
    if (hasRole(n, 'research') || hasRole(n, 'source') || n.empty) return;
    eligible++;
    const out = (g.out[i] as number[]).length;
    const inn = (g.inn[i] as number[]).length;
    if (out === 0 && inn > 0) {
      items.push(
        makeItem(ruleId, [n.path], 'Other notes link here, but this note links to no other note.', [
          { label: 'Backlinks', value: inn },
          { label: 'Outgoing note links', value: 0 },
        ], { severity: 'info' }),
      );
    }
  });
  return output(
    {
      ruleId, tier: 'hygiene', dimension: 'knowledge', severity: 'info',
      title: 'Dead-end notes',
      description: 'Notes that are linked to but link nowhere. Often perfectly normal (reference or leaf notes), so this is informational and carries low weight.',
      suggestion: 'Only worth a look if you expect these notes to connect onward.',
    },
    items,
    eligible,
  );
}

/** Groups of notes connected to each other but not to the main group, split into plain and research clusters. */
export function isolatedClusters(ctx: AnalysisContext): { plain: RuleOutput; research: RuleOutput } {
  const g = ctx.graph;
  const members = new Map<number, number[]>();
  g.comp.forEach((c, i) => {
    if (c === g.mainComp) return;
    const size = g.compSizes[c] as number;
    if (size < Math.max(2, ctx.config.thresholds.minClusterSize)) return;
    let list = members.get(c);
    if (!list) members.set(c, (list = []));
    list.push(i);
  });
  const mainSize = g.compSizes[g.mainComp] ?? 0;
  const plainItems: FindingItem[] = [];
  const researchItems: FindingItem[] = [];
  for (const idxs of members.values()) {
    const hub = idxs.reduce((best, i) => {
      const d = degree(g, i);
      const bd = degree(g, best);
      return d > bd || (d === bd && (g.paths[i] as string) < (g.paths[best] as string)) ? i : best;
    }, idxs[0] as number);
    const hubPath = g.paths[hub] as string;
    const paths = idxs.map((i) => g.paths[i] as string).sort();
    const roleCount = idxs.filter((i) => {
      const n = ctx.byPath.get(g.paths[i] as string);
      return n ? hasRole(n, 'research') || hasRole(n, 'source') : false;
    }).length;
    const sample = paths.slice(0, 5).join(', ');
    const evidence = [
      { label: 'Notes in this group', value: idxs.length },
      { label: 'Most-connected note', value: hubPath, path: hubPath },
      { label: 'Notes in main group', value: mainSize },
      { label: 'Sample', value: sample + (paths.length > 5 ? ', …' : '') },
    ];
    if (roleCount > 0) {
      researchItems.push(
        makeItem('research.cluster.disconnected', paths,
          `${idxs.length} notes (${roleCount} research/source) link to each other but have no link path to the main group of ${mainSize} notes.`,
          [{ label: 'Research/source notes', value: roleCount }, ...evidence],
          { units: roleCount, idKey: `hub:${hubPath}` }),
      );
    } else {
      plainItems.push(
        makeItem('knowledge.cluster.isolated', paths,
          `${idxs.length} notes link to each other but have no link path to the main group of ${mainSize} notes.`,
          evidence,
          { units: idxs.length, idKey: `hub:${hubPath}` }),
      );
    }
  }
  const roleNotes = ctx.research.length + ctx.sources.length;
  const plainEligible = ctx.notes.filter((n) => !hasRole(n, 'research') && !hasRole(n, 'source')).length;
  return {
    plain: output(
      {
        ruleId: 'knowledge.cluster.isolated', tier: 'structure', dimension: 'knowledge', severity: 'medium',
        title: 'Isolated clusters',
        description: 'Groups of two or more notes connected to each other but with no link path to the largest connected group. This is a structural observation about links, not a judgment about the ideas.',
        suggestion: 'Worth checking whether these groups are meant to stand apart or are missing a bridge to the rest of the vault.',
      },
      plainItems,
      plainEligible,
    ),
    research: output(
      {
        ruleId: 'research.cluster.disconnected', tier: 'integrity', dimension: 'research', severity: 'medium',
        title: 'Disconnected research clusters',
        description: 'Connected groups containing research or source notes that have no link path to the largest connected group of the vault.',
        suggestion: 'Worth checking whether this research area is intentionally separate or lacks links to related project notes.',
      },
      researchItems,
      roleNotes,
    ),
  };
}
