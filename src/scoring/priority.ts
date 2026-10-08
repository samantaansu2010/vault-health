import type { ScoringConfig } from '../model/settings.ts';
import type { Finding, FindingItem, RuleOutput, Severity } from '../model/types.ts';
import type { RegistryView } from './HealthScorer.ts';
import { effectiveSeverity } from './HealthScorer.ts';

export interface RankedFinding {
  finding: Finding;
  open: FindingItem[];
  ignored: FindingItem[];
  reviewed: number;
  severity: Severity;
  /** tierWeight × severityWeight, documented in docs/SCORING.md. */
  priority: number;
}

const SEV_ORDER: Severity[] = ['info', 'low', 'medium', 'high'];

export function rankFindings(outputs: RuleOutput[], view: RegistryView, cfg: ScoringConfig): RankedFinding[] {
  const ranked: RankedFinding[] = [];
  for (const { finding } of outputs) {
    const open: FindingItem[] = [];
    const ignored: FindingItem[] = [];
    let reviewed = 0;
    let sev: Severity = 'info';
    for (const item of finding.items) {
      const status = view.statusOf(item.id);
      if (status === 'ignored') {
        ignored.push(item);
        continue;
      }
      open.push(item);
      if (status === 'reviewed') reviewed++;
      const s = effectiveSeverity(item, finding.severity);
      if (SEV_ORDER.indexOf(s) > SEV_ORDER.indexOf(sev)) sev = s;
    }
    if (open.length === 0 && ignored.length === 0) continue;
    ranked.push({
      finding, open, ignored, reviewed, severity: sev,
      priority: (cfg.tierWeights[finding.tier] ?? 1) * (cfg.severityWeights[sev] ?? 1),
    });
  }
  return ranked.sort((a, b) => b.priority - a.priority || b.open.length - a.open.length || a.finding.title.localeCompare(b.finding.title));
}
