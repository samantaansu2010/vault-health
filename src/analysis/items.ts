import { computeItemId } from '../model/ids.ts';
import type { DimensionId, Evidence, Finding, FindingItem, RuleOutput, Severity, Tier } from '../model/types.ts';

export function makeItem(
  ruleId: string,
  paths: string[],
  reason: string,
  evidence: Evidence[] = [],
  opts: { units?: number; severity?: Severity; idKey?: string } = {},
): FindingItem {
  const item: FindingItem = {
    id: computeItemId(ruleId, paths, opts.idKey),
    paths,
    reason,
    evidence,
    units: opts.units ?? 1,
  };
  if (opts.idKey !== undefined) item.idKey = opts.idKey;
  if (opts.severity !== undefined) item.severity = opts.severity;
  return item;
}

export interface RuleMeta {
  ruleId: string;
  tier: Tier;
  dimension: DimensionId;
  severity: Severity;
  title: string;
  description: string;
  suggestion: string;
}

export function output(meta: RuleMeta, items: FindingItem[], eligible: number): RuleOutput {
  const finding: Finding = { ...meta, items };
  return { finding, eligible };
}

export const kb = (bytes: number): string => `${(bytes / 1024).toFixed(bytes >= 10240 ? 0 : 1)} KB`;
