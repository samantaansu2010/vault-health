/** Plain-data model shared by every pure layer. Nothing in here may import 'obsidian'. */

export type Tier = 'integrity' | 'structure' | 'hygiene';
export type Severity = 'high' | 'medium' | 'low' | 'info';
export type DimensionId = 'knowledge' | 'research' | 'sources' | 'structure' | 'visual' | 'maintenance';
export type Mode = 'vault' | 'research' | 'art';
export type AssetKind = 'image' | 'pdf' | 'audio' | 'video' | 'other';
export type ItemStatus = 'open' | 'ignored' | 'reviewed';

export interface Evidence {
  label: string;
  value: string | number;
  /** When set, the UI renders the value as an "open note" link. */
  path?: string;
}

/** A [[wikilink]] found inside a frontmatter property value. */
export interface PropLink {
  key: string;
  raw: string;
  target: string | null;
}

export interface EmbedRef {
  raw: string;
  target: string | null;
}

/** Signals extracted from a note body (only for notes whose role needs them). */
export interface BodySignals {
  urls: string[];
  footnotes: number;
  citekeys: string[];
}

export interface NoteFacts {
  path: string;
  basename: string;
  folder: string;
  mtime: number;
  size: number;
  /** Resolved link targets (any file type), de-duplicated, self-links removed. */
  links: string[];
  /** Unresolved link texts (embeds excluded). */
  unresolved: string[];
  embeds: EmbedRef[];
  propLinks: PropLink[];
  /** Lower-case, without '#'. */
  tags: string[];
  aliases: string[];
  props: Record<string, unknown>;
  /** No content beyond (optional) frontmatter. */
  empty: boolean;
  /** Assigned by the convention engine. */
  roles: string[];
  body?: BodySignals;
}

export interface AssetFacts {
  path: string;
  name: string;
  ext: string;
  kind: AssetKind;
  size: number;
  mtime: number;
  folder: string;
}

export interface VaultSnapshot {
  notes: NoteFacts[];
  assets: AssetFacts[];
  takenAt: number;
}

/** One affected thing inside a finding: a note, a group of notes, a cluster, a tag... */
export interface FindingItem {
  /** Stable across scans: hash(ruleId + paths) unless an idKey is supplied. */
  id: string;
  idKey?: string;
  paths: string[];
  /** Why THIS item was flagged. */
  reason: string;
  evidence: Evidence[];
  /** How many "eligible units" this item represents for scoring (default 1). */
  units: number;
  severity?: Severity;
}

export interface Finding {
  ruleId: string;
  tier: Tier;
  dimension: DimensionId;
  severity: Severity;
  title: string;
  /** Rule-level explanation: what the rule looks at and why it matters. */
  description: string;
  /** Phrased as "worth investigating", never as an instruction to change content. */
  suggestion: string;
  items: FindingItem[];
}

/** What an analyzer returns: the finding plus the denominator for its metric. */
export interface RuleOutput {
  finding: Finding;
  eligible: number;
}
