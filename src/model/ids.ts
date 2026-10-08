import { hashId } from '../util/hash.ts';

/** Item ids are stable across scans: same rule + same paths (or idKey) => same id. */
export function computeItemId(ruleId: string, paths: readonly string[], idKey?: string): string {
  const basis = idKey !== undefined ? idKey : [...paths].sort().join('\n');
  return hashId(`${ruleId}|${basis}`);
}
