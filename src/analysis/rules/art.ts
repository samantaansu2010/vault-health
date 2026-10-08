import type { ArtField } from '../../model/settings.ts';
import type { DimensionId, FindingItem, RuleOutput } from '../../model/types.ts';
import { ART_FIELD_LABEL, type ArtSummary } from '../art/artworks.ts';
import type { AnalysisContext } from '../context.ts';
import { makeItem, output } from '../items.ts';

const FIELD_DIM: Record<ArtField, DimensionId> = {
  artist: 'visual', year: 'visual', medium: 'visual', movement: 'visual', period: 'visual', source: 'sources', image: 'visual',
};

export function artRules(ctx: AnalysisContext, summary: ArtSummary): RuleOutput[] {
  const art = ctx.config.art;
  const n = summary.artworks.length;
  const outs: RuleOutput[] = [];

  for (const field of art.required) {
    const ruleId = `art.artwork.missing.${field}`;
    const items: FindingItem[] = [];
    for (const a of summary.artworks) {
      const lacks = field === 'image' ? !a.hasImage && a.brokenImages.length === 0 : a.values[field].length === 0;
      if (!lacks) continue;
      const names = art.fields[field].join(', ');
      items.push(makeItem(ruleId, [a.path],
        field === 'image'
          ? 'No image property and no embedded image was found in this artwork record.'
          : `None of the properties that hold ${ART_FIELD_LABEL[field].toLowerCase()} (${names}) is set on this artwork record.`,
        [{ label: 'Checked properties', value: names }], { severity: field === 'source' ? 'medium' : 'low' }));
    }
    outs.push(output({
      ruleId, tier: 'integrity', dimension: FIELD_DIM[field], severity: field === 'source' ? 'medium' : 'low',
      title: `Artworks missing ${ART_FIELD_LABEL[field].toLowerCase()}`,
      description: `Artwork records without ${ART_FIELD_LABEL[field].toLowerCase()}. Which properties count is configurable (Art & Media field mapping).`,
      suggestion: 'Worth completing if you rely on this field for browsing, citing or provenance.',
    }, items, n));
  }

  {
    const ruleId = 'art.artwork.broken-image';
    const items: FindingItem[] = [];
    for (const a of summary.artworks) {
      if (a.brokenImages.length === 0) continue;
      items.push(makeItem(ruleId, [a.path], `${a.brokenImages.length} image pointer${a.brokenImages.length === 1 ? '' : 's'} on this artwork record do not resolve to a file.`,
        a.brokenImages.slice(0, 5).map((b) => ({ label: 'Missing image', value: b })), { severity: 'high' }));
    }
    outs.push(output({
      ruleId, tier: 'integrity', dimension: 'visual', severity: 'high',
      title: 'Artworks with a broken image link',
      description: 'The image property points at a file that does not exist in the vault. (Broken embeds in note text are reported separately under media.)',
      suggestion: 'Worth checking whether the image was renamed, moved or never imported.',
    }, items, n));
  }

  {
    const ruleId = 'art.artwork.unparseable-date';
    const items: FindingItem[] = [];
    for (const a of summary.artworks) {
      if (!a.unparseableDate) continue;
      items.push(makeItem(ruleId, [a.path], 'The date is present but cannot be read as a year, so this artwork is left off any chronology.',
        [{ label: 'Date as written', value: a.unparseableDate }], { severity: 'low' }));
    }
    outs.push(output({
      ruleId, tier: 'integrity', dimension: 'visual', severity: 'low',
      title: 'Artworks with unreadable dates',
      description: 'Dates are read only when written as a year, ISO date, decade (1880s), range, or with "c."/"ca.". Anything else (centuries, BCE, free text) is listed here, never guessed.',
      suggestion: 'Worth rewriting in a readable form if you want it to appear in timelines.',
    }, items, summary.artworks.filter((a) => a.year || a.unparseableDate).length));
  }
  return outs;
}
