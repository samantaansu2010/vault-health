import type { ScoringConfig } from '../model/settings.ts';
import type { DimensionId, FindingItem, ItemStatus, RuleOutput, Severity, Tier } from '../model/types.ts';
import { METRICS } from './metricDefs.ts';

export interface RegistryView {
  statusOf(itemId: string): ItemStatus;
  firstSeen(itemId: string): number | undefined;
}

export type MetricStatus = 'scored' | 'not-applicable' | 'insufficient-data';

export interface MetricScore {
  id: string;
  label: string;
  dimension: DimensionId;
  tier: Tier | 'derived';
  explain: string;
  affected: number;
  eligible: number;
  /** Units of items the user has ignored (excluded from `affected`). */
  ignored: number;
  rate: number;
  tolerance: number;
  weight: number;
  status: MetricStatus;
  score: number | null;
  /** Effective share of the dimension (after the hygiene cap), 0..1. */
  share: number;
  formula: string;
}

export interface DimensionScore {
  id: DimensionId;
  score: number | null;
  /** Why there is no score, when null. */
  reason?: string;
  weight: number;
  /** Effective share of the overall score, 0..1 (0 when not scored). */
  share: number;
  metrics: MetricScore[];
  formula: string;
}

export interface HealthReport {
  overall: { score: number | null; formula: string; reason?: string };
  dimensions: DimensionScore[];
  metrics: MetricScore[];
  ignoredItems: number;
  scoredMetrics: number;
  totalMetrics: number;
}

export const DIMENSION_ORDER: DimensionId[] = ['knowledge', 'research', 'sources', 'structure', 'visual', 'maintenance'];
export const DIMENSION_LABEL: Record<DimensionId, string> = {
  knowledge: 'Knowledge', research: 'Research', sources: 'Sources', structure: 'Structure', visual: 'Visual', maintenance: 'Maintenance',
};

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

export function effectiveSeverity(item: FindingItem, base: Severity): Severity {
  return item.severity ?? base;
}

function metricFrom(
  id: string, dimension: DimensionId, tier: Tier | 'derived', affected: number, eligible: number, ignored: number, cfg: ScoringConfig,
): MetricScore {
  const def = METRICS[id];
  const ov = cfg.overrides[id];
  const weight = ov?.weight ?? def?.weight ?? 1;
  const tolerance = ov?.tolerance ?? def?.tolerance ?? 0.1;
  const rate = eligible > 0 ? Math.min(1, affected / eligible) : 0;
  let status: MetricStatus = 'scored';
  if (eligible === 0) status = 'not-applicable';
  else if (eligible < cfg.minSample) status = 'insufficient-data';
  const score = status === 'scored' ? Math.max(0, 100 * (1 - Math.min(1, rate / tolerance))) : null;
  let formula: string;
  if (status === 'not-applicable') formula = 'Not applicable: there is nothing eligible to measure.';
  else if (status === 'insufficient-data') formula = `Only ${eligible} eligible (minimum ${cfg.minSample} needed); shown but not scored.`;
  else formula = `rate = ${affected} ÷ ${eligible} = ${pct(rate)}; tolerance ${pct(tolerance, 0)}; score = 100 × (1 − min(1, ${pct(rate)} ÷ ${pct(tolerance, 0)})) = ${Math.round(score as number)}`;
  return {
    id, label: def?.label ?? id, dimension, tier, explain: def?.explain ?? '', affected, eligible, ignored, rate, tolerance, weight,
    status, score, share: 0, formula,
  };
}

function weightedMean(ms: MetricScore[]): number {
  const w = ms.reduce((a, m) => a + m.weight, 0);
  return w === 0 ? 0 : ms.reduce((a, m) => a + m.weight * (m.score as number), 0) / w;
}

export function computeReport(outputs: RuleOutput[], view: RegistryView, cfg: ScoringConfig, now: number): HealthReport {
  const metrics: MetricScore[] = [];
  let ignoredItems = 0;
  const attention: { item: FindingItem; status: ItemStatus }[] = [];

  for (const o of outputs) {
    const f = o.finding;
    let affected = 0;
    let ignored = 0;
    for (const item of f.items) {
      const status = view.statusOf(item.id);
      if (status === 'ignored') {
        ignored += item.units;
        ignoredItems++;
        continue;
      }
      affected += item.units;
      const sev = effectiveSeverity(item, f.severity);
      if (sev === 'high' || sev === 'medium') attention.push({ item, status });
    }
    metrics.push(metricFrom(f.ruleId, f.dimension, f.tier, affected, o.eligible, ignored, cfg));
  }

  // Maintenance: strictly review state, unresolved findings and their age (+ history, when it exists).
  const ageMs = cfg.issueAgeDays * 86_400_000;
  const unreviewed = attention.filter((a) => a.status !== 'reviewed').length;
  const aged = attention.filter((a) => {
    const fs = view.firstSeen(a.item.id);
    return fs !== undefined && now - fs > ageMs;
  }).length;
  metrics.push(metricFrom('maintenance.review-coverage', 'maintenance', 'derived', unreviewed, attention.length, 0, cfg));
  metrics.push(metricFrom('maintenance.issue-age', 'maintenance', 'derived', aged, attention.length, 0, cfg));
  const trend = metricFrom('maintenance.trend', 'maintenance', 'derived', 0, 0, 0, cfg);
  trend.formula = 'Not available: health history is not enabled.';
  metrics.push(trend);

  const dimensions: DimensionScore[] = DIMENSION_ORDER.map((id) => {
    const ms = metrics.filter((m) => m.dimension === id);
    const scored = ms.filter((m) => m.status === 'scored');
    const core = scored.filter((m) => m.tier !== 'hygiene');
    const hyg = scored.filter((m) => m.tier === 'hygiene');
    const weight = cfg.dimensionWeights[id] ?? 0;
    const base = { id, weight, share: 0, metrics: ms };
    if (core.length === 0) {
      return {
        ...base, score: null,
        reason: hyg.length > 0 ? 'Only housekeeping metrics apply here, so no score is given.' : 'No metric in this dimension has enough eligible data.',
        formula: 'No score.',
      };
    }
    let score: number;
    let note = '';
    if (hyg.length === 0) {
      score = weightedMean(core);
      const w = core.reduce((a, m) => a + m.weight, 0);
      core.forEach((m) => (m.share = m.weight / w));
    } else {
      const wc = core.reduce((a, m) => a + m.weight, 0);
      const wh = hyg.reduce((a, m) => a + m.weight, 0);
      const hygShare = Math.min(cfg.hygieneCap, wh / (wc + wh));
      score = (1 - hygShare) * weightedMean(core) + hygShare * weightedMean(hyg);
      core.forEach((m) => (m.share = (1 - hygShare) * (m.weight / wc)));
      hyg.forEach((m) => (m.share = hygShare * (m.weight / wh)));
      note = ` Housekeeping metrics contribute ${pct(hygShare, 0)} (cap ${pct(cfg.hygieneCap, 0)}).`;
    }
    return {
      ...base, score,
      formula: `Weighted mean of ${scored.length} scored metric${scored.length === 1 ? '' : 's'} (each metric's share × its score).${note}`,
    };
  });

  const scoredDims = dimensions.filter((d) => d.score !== null && d.weight > 0);
  const totalW = scoredDims.reduce((a, d) => a + d.weight, 0);
  let overall: HealthReport['overall'];
  if (scoredDims.length === 0 || totalW === 0) {
    overall = { score: null, formula: 'No score.', reason: 'No dimension has enough applicable data yet.' };
  } else {
    scoredDims.forEach((d) => (d.share = d.weight / totalW));
    const score = scoredDims.reduce((a, d) => a + d.share * (d.score as number), 0);
    overall = {
      score,
      formula: `Weighted mean of ${scoredDims.length} dimension score${scoredDims.length === 1 ? '' : 's'}: ` +
        scoredDims.map((d) => `${DIMENSION_LABEL[d.id]} ${Math.round(d.score as number)} × ${pct(d.share, 0)}`).join(' + ') +
        ` = ${Math.round(score)}`,
    };
  }

  return {
    overall,
    dimensions,
    metrics,
    ignoredItems,
    scoredMetrics: metrics.filter((m) => m.status === 'scored').length,
    totalMetrics: metrics.filter((m) => m.status !== 'not-applicable').length,
  };
}
