import { hasRole } from '../../conventions/roles.ts';
import type { ArtConfig, ArtField } from '../../model/settings.ts';
import type { NoteFacts } from '../../model/types.ts';
import { getProp, normKey, propStrings, stripWikilink } from '../../util/normalize.ts';
import type { AnalysisContext } from '../context.ts';
import { parseYear, type ParsedYear } from './dates.ts';

export const ART_FIELD_LABEL: Record<ArtField, string> = {
  artist: 'Artist', year: 'Year', medium: 'Medium', movement: 'Movement', period: 'Period', source: 'Source', image: 'Image',
};

const IMAGE_EXT = /\.(png|jpe?g|gif|bmp|svg|webp|avif|tiff?|heic)$/i;

export interface ArtworkInfo {
  path: string;
  title: string;
  values: Record<ArtField, string[]>;
  year: ParsedYear | null;
  /** Date strings present but not understood (listed, never guessed). */
  unparseableDate: string | null;
  hasImage: boolean;
  /** Image pointers (properties) that do not resolve. */
  brokenImages: string[];
}

export interface FacetCount {
  value: string;
  count: number;
}

export interface ArtSummary {
  artworks: ArtworkInfo[];
  facets: Record<'artist' | 'movement' | 'period' | 'medium', FacetCount[]>;
  /** Count of artworks lacking each field (all fields, regardless of "required"). */
  missing: Record<ArtField, number>;
}

export function valuesFor(props: Record<string, unknown>, names: readonly string[]): string[] {
  for (const n of names) {
    const vals = propStrings(getProp(props, n)).map((v) => stripWikilink(v)).filter(Boolean);
    if (vals.length) return vals;
  }
  return [];
}

export function analyzeArtwork(n: NoteFacts, art: ArtConfig): ArtworkInfo {
  const values = {} as Record<ArtField, string[]>;
  for (const f of Object.keys(art.fields) as ArtField[]) values[f] = valuesFor(n.props, art.fields[f]);

  let year: ParsedYear | null = null;
  let unparseableDate: string | null = null;
  for (const v of values.year) {
    year = parseYear(v);
    if (year) break;
  }
  if (!year && values.year.length > 0) unparseableDate = values.year[0] as string;

  const imageKeys = new Set(art.fields.image.map(normKey));
  const imageProps = n.propLinks.filter((p) => imageKeys.has(normKey(p.key)));
  const brokenImages = imageProps.filter((p) => p.target === null).map((p) => p.raw);
  const embeddedImage = n.embeds.some((e) => IMAGE_EXT.test(e.target ?? e.raw));
  const hasImage = values.image.length > 0 || imageProps.length > 0 || embeddedImage;
  // A pointer that is present but broken is reported as "broken", not as "missing".
  return { path: n.path, title: n.basename, values, year, unparseableDate, hasImage, brokenImages };
}

export function summarizeArt(ctx: AnalysisContext): ArtSummary {
  const artworks = ctx.notes.filter((n) => hasRole(n, 'artwork')).map((n) => analyzeArtwork(n, ctx.config.art));
  const facetOf = (field: 'artist' | 'movement' | 'period' | 'medium'): FacetCount[] => {
    const counts = new Map<string, { display: string; count: number }>();
    for (const a of artworks) {
      for (const v of new Set(a.values[field].map((x) => x.trim()))) {
        const k = v.toLowerCase();
        const e = counts.get(k);
        if (e) e.count++;
        else counts.set(k, { display: v, count: 1 });
      }
    }
    return [...counts.values()].map((e) => ({ value: e.display, count: e.count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  };
  const missing = {} as Record<ArtField, number>;
  for (const f of Object.keys(ctx.config.art.fields) as ArtField[]) {
    missing[f] = artworks.filter((a) => (f === 'image' ? !a.hasImage && a.brokenImages.length === 0 : a.values[f].length === 0)).length;
  }
  return {
    artworks,
    facets: { artist: facetOf('artist'), movement: facetOf('movement'), period: facetOf('period'), medium: facetOf('medium') },
    missing,
  };
}
