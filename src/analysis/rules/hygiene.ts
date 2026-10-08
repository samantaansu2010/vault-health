import type { FindingItem, RuleOutput } from '../../model/types.ts';
import type { AnalysisContext } from '../context.ts';
import { kb, makeItem, output } from '../items.ts';

export function singletonTags(ctx: AnalysisContext): RuleOutput {
  const ruleId = 'hygiene.tag.singleton';
  const users = new Map<string, string[]>();
  for (const n of ctx.notes) for (const t of n.tags) {
    let l = users.get(t);
    if (!l) users.set(t, (l = []));
    l.push(n.path);
  }
  const items: FindingItem[] = [];
  for (const [tag, paths] of users) {
    if (paths.length !== 1) continue;
    items.push(makeItem(ruleId, [paths[0] as string], `The tag #${tag} is used by only this one note.`,
      [{ label: 'Tag', value: `#${tag}` }], { idKey: `tag:${tag}`, severity: 'info' }));
  }
  return output({
    ruleId, tier: 'hygiene', dimension: 'structure', severity: 'info',
    title: 'Tags used only once',
    description: 'Obsidian only knows tags that appear in notes, so a truly unused tag cannot exist; tags used by a single note are the closest structural signal of stray or mistyped tags.',
    suggestion: 'Informational: may be typos or one-off labels.',
  }, items, users.size);
}

export function oversizedNotes(ctx: AnalysisContext): RuleOutput {
  const ruleId = 'hygiene.note.oversized';
  const limit = ctx.config.thresholds.oversizedBytes;
  const items: FindingItem[] = [];
  for (const n of ctx.notes) {
    if (n.size <= limit) continue;
    items.push(makeItem(ruleId, [n.path], `This note is ${kb(n.size)}, above your threshold of ${kb(limit)}.`,
      [{ label: 'Size', value: kb(n.size) }], { severity: 'info' }));
  }
  return output({
    ruleId, tier: 'hygiene', dimension: 'structure', severity: 'info',
    title: 'Oversized notes',
    description: 'Notes above the size threshold. Very long notes can be slow to edit and hard to link into.',
    suggestion: 'Informational; long notes are sometimes intentional.',
  }, items, ctx.notes.length);
}

export function emptyNotes(ctx: AnalysisContext): RuleOutput {
  const ruleId = 'hygiene.note.empty';
  const items: FindingItem[] = [];
  for (const n of ctx.notes) {
    if (!n.empty) continue;
    items.push(makeItem(ruleId, [n.path], 'This note has no content beyond optional properties.',
      [{ label: 'Size', value: `${n.size} bytes` }], { severity: 'info' }));
  }
  return output({
    ruleId, tier: 'hygiene', dimension: 'structure', severity: 'info',
    title: 'Empty notes',
    description: 'Notes with no body content. They are often deliberate placeholders.',
    suggestion: 'Informational.',
  }, items, ctx.notes.length);
}
