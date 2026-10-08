import type { AnalysisContext } from '../../analysis/context.ts';
import type { WorkspaceScope } from '../core/scope.ts';

const base = (p: string) => (p.split('/').pop() ?? p).replace(/\.md$/i, '').toLowerCase();

/**
 * For references whose note is gone, suggest existing notes with the same file name (e.g. it was moved while
 * Obsidian was closed). Suggestions only: the user decides, nothing is relinked automatically.
 */
export function suggestRelinks(ctx: AnalysisContext, scope: WorkspaceScope): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (scope.missing.length === 0) return out;
  const byName = new Map<string, string[]>();
  for (const p of ctx.allByPath.keys()) {
    const b = base(p);
    let l = byName.get(b);
    if (!l) byName.set(b, (l = []));
    l.push(p);
  }
  for (const ref of scope.missing) {
    const cands = (byName.get(base(ref.path)) ?? []).filter((p) => !scope.memberSet.has(p)).sort();
    out.set(ref.path, cands);
  }
  return out;
}
