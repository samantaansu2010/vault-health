import type { ConventionSet } from './conventions.ts';
import type { DimensionId, Mode, Severity, Tier } from './types.ts';

export interface Modules {
  structure: boolean;
  research: boolean;
  media: boolean;
  hygiene: boolean;
  art: boolean;
}

export type ArtField = 'artist' | 'year' | 'medium' | 'movement' | 'period' | 'source' | 'image';

/** Maps logical artwork fields to whichever property names the user actually uses. */
export interface ArtConfig {
  fields: Record<ArtField, string[]>;
  /** Fields whose absence is reported. Optional fields (movement, period) are still summarized as facets. */
  required: ArtField[];
}

export interface Thresholds {
  oversizedBytes: number;
  largeAssetBytes: number;
  /** Minimum number of notes for a connected group to be reported as an isolated cluster. */
  minClusterSize: number;
}

/** Everything the pure analyzers need. */
export interface AnalysisConfig {
  conventions: ConventionSet;
  modules: Modules;
  art: ArtConfig;
  excludeFolders: string[];
  excludeTags: string[];
  thresholds: Thresholds;
}

export interface MetricOverride {
  tolerance?: number;
  weight?: number;
}

export interface ScoringConfig {
  tierWeights: Record<Tier, number>;
  severityWeights: Record<Severity, number>;
  /** Hygiene metrics may contribute at most this share of a dimension's score. */
  hygieneCap: number;
  dimensionWeights: Record<DimensionId, number>;
  /** Eligible count below which a metric is shown but not scored. */
  minSample: number;
  issueAgeDays: number;
  overrides: Record<string, MetricOverride>;
}

export interface VaultHealthSettings {
  version: 1;
  mode: Mode;
  analysis: AnalysisConfig;
  scoring: ScoringConfig;
  /** Read note bodies of research/source notes to find URLs, footnotes and citekeys. */
  scanBodies: boolean;
  autoRefresh: boolean;
  /** Reserved for the history feature (not implemented yet). Never sends anything anywhere. */
  historyEnabled: boolean;
}
