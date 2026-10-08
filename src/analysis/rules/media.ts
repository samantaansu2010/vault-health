import type { FindingItem, RuleOutput } from '../../model/types.ts';
import type { AnalysisContext } from '../context.ts';
import { kb, makeItem, output } from '../items.ts';

export function brokenEmbeds(ctx: AnalysisContext): RuleOutput {
  const ruleId = 'visual.embed.broken';
  const items: FindingItem[] = [];
  let total = 0;
  for (const n of ctx.notes) {
    total += n.embeds.length;
    const broken = n.embeds.filter((e) => e.target === null);
    if (broken.length === 0) continue;
    items.push(makeItem(ruleId, [n.path],
      `${broken.length} embedded file${broken.length === 1 ? '' : 's'} in this note cannot be found in the vault.`,
      broken.slice(0, 8).map((b) => ({ label: 'Missing embed', value: b.raw })),
      { units: broken.length, severity: 'medium' }));
  }
  return output({
    ruleId, tier: 'structure', dimension: 'visual', severity: 'medium',
    title: 'Broken embeds (missing attachments)',
    description: 'Images, PDFs or notes embedded with ![[…]] whose file does not exist. Visible as empty placeholders in reading view.',
    suggestion: 'Worth checking whether the file was renamed, moved or deleted.',
  }, items, total);
}

export function unreferencedMedia(ctx: AnalysisContext): RuleOutput {
  const ruleId = 'visual.asset.unreferenced';
  const items: FindingItem[] = [];
  let eligible = 0;
  for (const a of ctx.assets) {
    if (a.kind !== 'image' && a.kind !== 'audio' && a.kind !== 'video') continue;
    eligible++;
    if ((ctx.referencedBy.get(a.path)?.size ?? 0) > 0) continue;
    items.push(makeItem(ruleId, [a.path], `No note links to or embeds this ${a.kind}.`,
      [{ label: 'Type', value: a.kind }, { label: 'Size', value: kb(a.size) }, { label: 'Folder', value: a.folder || '(vault root)' }],
      { severity: 'low' }));
  }
  return output({
    ruleId, tier: 'hygiene', dimension: 'visual', severity: 'low',
    title: 'Unreferenced images, audio and video',
    description: 'Media files that no note links or embeds. They may be used from outside Obsidian (canvases, web publishing), so nothing is ever deleted automatically.',
    suggestion: 'Worth checking before cleaning up: confirm they are not used somewhere Obsidian cannot see.',
  }, items, eligible);
}

export function largeAssets(ctx: AnalysisContext): RuleOutput {
  const ruleId = 'visual.asset.large';
  const limit = ctx.config.thresholds.largeAssetBytes;
  const items: FindingItem[] = [];
  for (const a of ctx.assets) {
    if (a.size <= limit) continue;
    items.push(makeItem(ruleId, [a.path], `This file is ${kb(a.size)}, above your large-file threshold of ${kb(limit)}.`,
      [{ label: 'Type', value: a.kind }, { label: 'Size', value: kb(a.size) }], { severity: 'info' }));
  }
  return output({
    ruleId, tier: 'hygiene', dimension: 'visual', severity: 'info',
    title: 'Very large media files',
    description: 'Files above the large-file threshold. Large media affects sync time and backups.',
    suggestion: 'Informational; relevant mainly if sync or backup is slow.',
  }, items, ctx.assets.length);
}
