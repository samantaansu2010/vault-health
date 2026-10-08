// Generates docs/RULES.md from the rule metadata in code. Usage: node scripts/gen-rules-doc.ts > docs/RULES.md
import { runAnalysis } from '../src/analysis/AnalysisEngine.ts';
import { defaultSettings } from '../src/settings/defaults.ts';
import { WorkspaceManager } from '../src/workspace/core/WorkspaceManager.ts';
import { analyzeWorkspace } from '../src/workspace/integration/analyze.ts';

const cfg = defaultSettings().analysis;
const r = await runAnalysis({ notes: [], assets: [], takenAt: 0 }, cfg, { yieldFn: async () => {} });
const order = { integrity: 0, structure: 1, hygiene: 2 } as const;
const outs = [...(r?.outputs ?? [])].sort((a, b) => order[a.finding.tier] - order[b.finding.tier]);
const lines = [
  '# Rules reference',
  '',
  'Generated from the code (`node scripts/gen-rules-doc.ts`). Every rule is deterministic, local, and read-only.',
  'Wording is deliberately structural: rules report what the vault\'s links, properties and files show, never whether a claim or idea is right.',
  '',
];
let tier = '';
for (const { finding: f } of outs) {
  if (f.tier !== tier) {
    tier = f.tier;
    lines.push(`## ${tier[0]?.toUpperCase()}${tier.slice(1)} tier`, '');
  }
  lines.push(`### ${f.title}`, '', `- **Rule id:** \`${f.ruleId}\``, `- **Dimension:** ${f.dimension} · **Base severity:** ${f.severity}`, `- **What it checks:** ${f.description}`, `- **How it is phrased:** ${f.suggestion}`, '');
}
if (r) {
  const def = new WorkspaceManager().create('doc');
  const ws = analyzeWorkspace(r.ctx, r.provenance, def, { issueCount: () => 0 }).outputs;
  lines.push('## Research Workspace rules', '', 'Evaluated per workspace on its member notes only. They are not part of the vault score; Ignore and Mark reviewed apply per workspace.', '');
  for (const { finding: f } of ws) {
    lines.push(`### ${f.title}`, '', `- **Rule id:** \`${f.ruleId}\``, `- **Base severity:** ${f.severity}`, `- **What it checks:** ${f.description}`, `- **How it is phrased:** ${f.suggestion}`, '');
  }
}
console.log(lines.join('\n'));
