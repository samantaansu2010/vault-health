import { makeItem, output } from '../../analysis/items.ts';
import type { FindingItem, RuleOutput } from '../../model/types.ts';
import type { WorkspaceScope } from '../core/scope.ts';
import type { LocalGraph } from '../graph/localGraph.ts';

/** Item ids include the workspace id, so ignoring a finding in one workspace never hides it in another. */
const key = (wsId: string, what: string) => `ws:${wsId}:${what}`;
export const isWorkspaceRule = (ruleId: string) => ruleId.startsWith('workspace.');
export const workspaceIdOfKey = (idKey: string | undefined): string | null => {
  const m = /^ws:([^:]+):/.exec(idKey ?? '');
  return m ? (m[1] as string) : null;
};

const META = {
  tier: 'structure' as const,
  dimension: 'knowledge' as const,
};

/** Diagnostics about the workspace as a unit. Research/link findings for member notes are reused from the vault analysis. */
export function workspaceRules(scope: WorkspaceScope, g: LocalGraph, relinks: Map<string, string[]>): RuleOutput[] {
  const id = scope.def.id;
  const n = scope.members.length;
  const outs: RuleOutput[] = [];

  {
    const ruleId = 'workspace.member.missing';
    const items: FindingItem[] = scope.missing.map((ref) => {
      const suggestions = relinks.get(ref.path) ?? [];
      return makeItem(ruleId, [ref.path],
        'This note is in the workspace but no longer exists at this path. It may have been deleted, or moved or renamed while Obsidian was not watching. The reference is kept until you remove or relink it.',
        [
          { label: 'Added to workspace', value: new Date(ref.addedAt).toLocaleDateString() },
          ...suggestions.slice(0, 3).map((p) => ({ label: 'Possible match (same file name)', value: p, path: p })),
        ],
        { severity: 'high', idKey: key(id, `missing:${ref.path}`) });
    });
    outs.push(output({
      ruleId, ...META, severity: 'high',
      title: 'Workspace notes that can no longer be found',
      description: 'References in this workspace whose note does not exist at the stored path. Nothing was changed in your vault; only the reference is affected.',
      suggestion: 'Worth relinking to the moved note, or removing the reference.',
    }, items, scope.def.notes.length));
  }

  {
    const ruleId = 'workspace.member.isolated';
    const items: FindingItem[] = [];
    if (n >= 2) {
      for (const i of g.isolated) {
        const path = g.members[i] as string;
        const ext = (g.externalOut[i] as number) + (g.externalIn[i] as number);
        items.push(makeItem(ruleId, [path],
          'This note has no link to or from any other note in this workspace.',
          [
            { label: 'Links to notes outside the workspace', value: g.externalOut[i] as number },
            { label: 'Notes outside linking in', value: g.externalIn[i] as number },
          ],
          { severity: ext > 0 ? 'medium' : 'low', idKey: key(id, `isolated:${path}`) }));
      }
    }
    outs.push(output({
      ruleId, ...META, severity: 'medium',
      title: 'Workspace notes not connected to the rest of the workspace',
      description: 'Members with no internal connection. If they do connect to notes outside the workspace, "Add connected notes" may show the bridge.',
      suggestion: 'Worth checking whether each belongs in this workspace.',
    }, items, n >= 2 ? n : 0));
  }

  {
    const ruleId = 'workspace.cluster.split';
    const items: FindingItem[] = [];
    if (g.clusters.length >= 2) {
      const largest = g.clusters[0]!;
      for (const c of g.clusters.slice(1)) {
        const hub = g.members[c.hub] as string;
        items.push(makeItem(ruleId, c.members.map((i) => g.members[i] as string).sort(),
          `${c.members.length} notes link to each other but not to the largest group in this workspace (${largest.members.length} notes).`,
          [
            { label: 'Notes in this group', value: c.members.length },
            { label: 'Most-connected note', value: hub, path: hub },
            { label: 'Largest group', value: largest.members.length },
          ],
          { units: c.members.length, severity: 'medium', idKey: key(id, `cluster:${hub}`) }));
      }
    }
    outs.push(output({
      ruleId, ...META, severity: 'medium',
      title: 'Workspace split into separate groups',
      description: 'Groups of members connected to each other but not to the workspace\'s largest connected group. A structural observation, not a judgment about the topic.',
      suggestion: 'Worth checking whether the groups are meant to be one topic, or are better as separate workspaces.',
    }, items, n));
  }

  {
    const ruleId = 'workspace.member.external-heavy';
    const items: FindingItem[] = [];
    g.members.forEach((path, i) => {
      const ext = (g.externalOut[i] as number) + (g.externalIn[i] as number);
      const internal = g.internalDegree[i] as number;
      if (n >= 2 && internal >= 1 && ext >= 5 && ext >= 5 * internal) {
        items.push(makeItem(ruleId, [path], 'Most of this note\'s connections point outside the workspace.',
          [{ label: 'Internal connections', value: internal }, { label: 'External connections', value: ext }],
          { severity: 'info', idKey: key(id, `external:${path}`) }));
      }
    });
    outs.push(output({
      ruleId, ...META, tier: 'hygiene', severity: 'info',
      title: 'Notes mostly connected outside the workspace',
      description: 'Members whose links mostly lead elsewhere. They may be gateways to related material.',
      suggestion: 'Informational; "Add connected notes" lists what they connect to.',
    }, items, n >= 2 ? n : 0));
  }
  return outs;
}
