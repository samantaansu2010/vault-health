import type { AnalysisContext } from '../../analysis/context.ts';
import type { WorkspaceScope } from '../core/scope.ts';

export interface ConnectedCandidate {
  path: string;
  title: string;
  /** Members that link TO this note. */
  linkedFromMembers: string[];
  /** Members this note links to. */
  linksToMembers: string[];
  /** Distinct members connected to it in either direction. */
  connections: number;
  /** Distinct notes it is linked with overall; hub notes such as indexes connect to everything. */
  degree: number;
  /** connections ÷ degree: how much of this note's linking is aimed at the workspace. */
  specificity: number;
}

export interface ConnectedOptions {
  minConnections?: number;
  limit?: number;
}

/**
 * "Add Connected Notes": notes outside the workspace that are linked to or from at least N members.
 * Only link evidence is used; nothing is guessed from content. Excluded-folder notes are not suggested.
 */
export function findConnectedNotes(ctx: AnalysisContext, scope: WorkspaceScope, opts: ConnectedOptions = {}): ConnectedCandidate[] {
  const min = Math.max(1, opts.minConnections ?? 1);
  const from = new Map<string, Set<string>>();
  const to = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, k: string, v: string) => {
    let s = m.get(k);
    if (!s) m.set(k, (s = new Set()));
    s.add(v);
  };
  for (const member of scope.members) {
    const note = ctx.allByPath.get(member);
    if (note) for (const t of note.links) if (t !== member && !scope.memberSet.has(t) && ctx.byPath.has(t)) add(from, t, member);
    for (const p of ctx.referencedBy.get(member) ?? []) if (p !== member && !scope.memberSet.has(p) && ctx.byPath.has(p)) add(to, p, member);
  }
  const keys = new Set<string>([...from.keys(), ...to.keys()]);
  const out: ConnectedCandidate[] = [];
  for (const path of keys) {
    const fromMembers = [...(from.get(path) ?? [])].sort();
    const toMembers = [...(to.get(path) ?? [])].sort();
    const connections = new Set([...fromMembers, ...toMembers]).size;
    if (connections < min) continue;
    const note = ctx.allByPath.get(path);
    const neighbours = new Set<string>();
    for (const t of note?.links ?? []) if (t !== path && ctx.byPath.has(t)) neighbours.add(t);
    for (const p of ctx.referencedBy.get(path) ?? []) if (p !== path && ctx.byPath.has(p)) neighbours.add(p);
    const degree = Math.max(1, neighbours.size);
    out.push({
      path, title: note?.basename ?? path, linkedFromMembers: fromMembers, linksToMembers: toMembers,
      connections, degree, specificity: Math.min(1, connections / degree),
    });
  }
  out.sort((a, b) => b.connections - a.connections || b.specificity - a.specificity || a.title.localeCompare(b.title));
  return out.slice(0, opts.limit ?? 500);
}
