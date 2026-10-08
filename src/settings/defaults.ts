import { presetById } from '../conventions/presets.ts';
import type { ScoringConfig, VaultHealthSettings } from '../model/settings.ts';
import type { DimensionId, Mode } from '../model/types.ts';

export const DIMENSION_WEIGHTS: Record<Mode, Record<DimensionId, number>> = {
  vault:    { knowledge: 20, research: 15, sources: 15, structure: 20, visual: 15, maintenance: 15 },
  research: { knowledge: 15, research: 25, sources: 25, structure: 10, visual: 5,  maintenance: 20 },
  art:      { knowledge: 15, research: 10, sources: 15, structure: 10, visual: 35, maintenance: 15 },
};

export function defaultScoring(mode: Mode = 'vault'): ScoringConfig {
  return {
    tierWeights: { integrity: 3, structure: 2, hygiene: 1 },
    severityWeights: { high: 3, medium: 2, low: 1, info: 0.5 },
    hygieneCap: 0.2,
    dimensionWeights: { ...DIMENSION_WEIGHTS[mode] },
    minSample: 5,
    issueAgeDays: 30,
    overrides: {},
  };
}

export function defaultSettings(): VaultHealthSettings {
  return {
    version: 1,
    mode: 'vault',
    analysis: {
      conventions: presetById('props-or-tags'),
      modules: { structure: true, research: true, media: true, hygiene: true, art: true },
      art: {
        fields: {
          artist: ['artist', 'creator', 'maker'],
          year: ['year', 'date', 'created'],
          medium: ['medium', 'technique'],
          movement: ['movement', 'style'],
          period: ['period', 'era'],
          source: ['source', 'museum', 'provenance', 'url'],
          image: ['image', 'cover', 'thumbnail'],
        },
        required: ['artist', 'year', 'medium', 'source', 'image'],
      },
      excludeFolders: ['Templates', 'templates'],
      excludeTags: ['template'],
      thresholds: { oversizedBytes: 100_000, largeAssetBytes: 25 * 1024 * 1024, minClusterSize: 2 },
    },
    scoring: defaultScoring('vault'),
    scanBodies: true,
    autoRefresh: true,
    historyEnabled: false,
  };
}

/** Shallow-per-section merge so new settings keys appear after plugin updates without losing user values. */
export function mergeSettings(saved: unknown): VaultHealthSettings {
  const d = defaultSettings();
  if (typeof saved !== 'object' || saved === null) return d;
  const s = saved as Partial<VaultHealthSettings>;
  return {
    ...d,
    ...s,
    version: 1,
    analysis: {
      ...d.analysis,
      ...(s.analysis ?? {}),
      modules: { ...d.analysis.modules, ...(s.analysis?.modules ?? {}) },
      thresholds: { ...d.analysis.thresholds, ...(s.analysis?.thresholds ?? {}) },
      art: {
        ...d.analysis.art,
        ...(s.analysis?.art ?? {}),
        fields: { ...d.analysis.art.fields, ...(s.analysis?.art?.fields ?? {}) },
      },
      conventions: s.analysis?.conventions ?? d.analysis.conventions,
    },
    scoring: {
      ...d.scoring,
      ...(s.scoring ?? {}),
      tierWeights: { ...d.scoring.tierWeights, ...(s.scoring?.tierWeights ?? {}) },
      severityWeights: { ...d.scoring.severityWeights, ...(s.scoring?.severityWeights ?? {}) },
      dimensionWeights: { ...d.scoring.dimensionWeights, ...(s.scoring?.dimensionWeights ?? {}) },
      overrides: { ...(s.scoring?.overrides ?? {}) },
    },
  };
}
