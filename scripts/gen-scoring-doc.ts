// Regenerates the metric table in docs/SCORING.md from the code, so documentation cannot drift.
// Usage: node scripts/gen-scoring-doc.ts > /tmp/table.md   (Node >= 22.18)
import { runAnalysis } from '../src/analysis/AnalysisEngine.ts';
import { defaultSettings } from '../src/settings/defaults.ts';
import { METRICS } from '../src/scoring/metricDefs.ts';

const cfg = defaultSettings().analysis;
const r = await runAnalysis({ notes: [], assets: [], takenAt: 0 }, cfg, { yieldFn: async () => {} });
const meta = new Map((r?.outputs ?? []).map((o) => [o.finding.ruleId, o.finding]));
const rows: string[] = ['| Metric id | Dimension | Tier | Weight | Tolerance | What is measured |', '|---|---|---|---|---|---|'];
for (const m of Object.values(METRICS)) {
  const f = meta.get(m.id);
  const dim = f?.dimension ?? 'maintenance';
  const tier = f?.tier ?? 'derived';
  rows.push(`| \`${m.id}\` | ${dim} | ${tier} | ${m.weight} | ${Math.round(m.tolerance * 100)}% | ${m.explain} |`);
}
console.log(rows.join('\n'));
