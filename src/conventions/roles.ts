import type { MatchExpr, RoleDefinition } from '../model/conventions.ts';
import type { NoteFacts } from '../model/types.ts';
import { getProp, normKey, normTag, patternToRegExp, propStrings, stripWikilink } from '../util/normalize.ts';

export type RoleSubject = Pick<NoteFacts, 'path' | 'basename' | 'folder' | 'tags' | 'aliases' | 'props'>;

function folderMatches(folder: string, target: string, recursive: boolean): boolean {
  const f = folder.replace(/^\/+|\/+$/g, '').toLowerCase();
  const t = target.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (t === '') return true;
  return f === t || (recursive && f.startsWith(t + '/'));
}

export function evalMatch(expr: MatchExpr, s: RoleSubject): boolean {
  if ('any' in expr) return expr.any.some((e) => evalMatch(e, s));
  if ('all' in expr) return expr.all.length > 0 && expr.all.every((e) => evalMatch(e, s));
  if ('not' in expr) return !evalMatch(expr.not, s);
  switch (expr.kind) {
    case 'property': {
      const values = propStrings(getProp(s.props, expr.key)).map((v) => stripWikilink(v).toLowerCase());
      if (expr.op === 'exists') return values.length > 0;
      const want = (expr.value ?? '').trim().toLowerCase();
      if (expr.op === 'equals') return values.some((v) => v === want);
      return want !== '' && values.some((v) => v.includes(want));
    }
    case 'tag': {
      const want = normTag(expr.tag);
      return s.tags.some((t) => t === want || (expr.includeNested !== false && t.startsWith(want + '/')));
    }
    case 'folder':
      return folderMatches(s.folder, expr.path, expr.recursive !== false);
    case 'alias': {
      const re = patternToRegExp(expr.pattern);
      return s.aliases.some((a) => re.test(a));
    }
    case 'filename':
      return patternToRegExp(expr.pattern).test(s.basename);
  }
}

/** Returns an error message if `x` is not a valid MatchExpr, else null. */
export function validateMatchExpr(x: unknown, depth = 0): string | null {
  if (depth > 8) return 'match expression nested too deeply';
  if (typeof x !== 'object' || x === null) return 'match expression must be an object';
  const o = x as Record<string, unknown>;
  for (const k of ['any', 'all'] as const) {
    if (k in o) {
      if (!Array.isArray(o[k])) return `"${k}" must be an array`;
      for (const e of o[k] as unknown[]) {
        const err = validateMatchExpr(e, depth + 1);
        if (err) return err;
      }
      return null;
    }
  }
  if ('not' in o) return validateMatchExpr(o.not, depth + 1);
  switch (o.kind) {
    case 'property':
      if (typeof o.key !== 'string') return 'property matcher needs a string "key"';
      if (o.op !== 'equals' && o.op !== 'contains' && o.op !== 'exists') return 'property "op" must be equals, contains or exists';
      if (o.op !== 'exists' && typeof o.value !== 'string') return 'property matcher needs a string "value"';
      return null;
    case 'tag':
      return typeof o.tag === 'string' ? null : 'tag matcher needs a string "tag"';
    case 'folder':
      return typeof o.path === 'string' ? null : 'folder matcher needs a string "path"';
    case 'alias':
    case 'filename':
      return typeof o.pattern === 'string' ? null : `${String(o.kind)} matcher needs a string "pattern"`;
    default:
      return 'unknown matcher kind (expected property, tag, folder, alias, filename, any, all or not)';
  }
}

export function validateRoles(x: unknown): string | null {
  if (!Array.isArray(x)) return 'roles must be an array';
  const seen = new Set<string>();
  for (const r of x as unknown[]) {
    if (typeof r !== 'object' || r === null) return 'each role must be an object';
    const role = r as Record<string, unknown>;
    if (typeof role.id !== 'string' || !role.id) return 'each role needs a string "id"';
    if (seen.has(role.id)) return `duplicate role id "${role.id}"`;
    seen.add(role.id);
    if (typeof role.label !== 'string') return `role "${role.id}" needs a string "label"`;
    const err = validateMatchExpr(role.match);
    if (err) return `role "${role.id}": ${err}`;
  }
  return null;
}

/** Assigns roles in place; returns how many notes matched each role (for live settings feedback). */
export function assignRoles(notes: NoteFacts[], roles: readonly RoleDefinition[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of roles) counts.set(r.id, 0);
  for (const n of notes) {
    const assigned: string[] = [];
    for (const r of roles) {
      if (evalMatch(r.match, n)) {
        assigned.push(r.id);
        counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
      }
    }
    n.roles = assigned;
  }
  return counts;
}

export function hasRole(n: Pick<NoteFacts, 'roles'>, role: string): boolean {
  return n.roles.includes(role);
}

export { normKey };
