export type Matcher =
  | { kind: 'property'; key: string; op: 'equals' | 'contains' | 'exists'; value?: string }
  | { kind: 'tag'; tag: string; includeNested?: boolean }
  | { kind: 'folder'; path: string; recursive?: boolean }
  | { kind: 'alias'; pattern: string }
  | { kind: 'filename'; pattern: string };

export type MatchExpr =
  | Matcher
  | { any: MatchExpr[] }
  | { all: MatchExpr[] }
  | { not: MatchExpr };

export interface RoleDefinition {
  /** Reserved ids used by analyzers: research, source, artwork, artist, movement. Others are allowed. */
  id: string;
  label: string;
  match: MatchExpr;
}

export interface FieldRequirement {
  /** Every one of these properties must be present. */
  all: string[];
  /** At least one of these properties must be present (ignored when empty). */
  any: string[];
}

export interface ProvenanceConfig {
  /** Properties whose [[links]] point at sources (e.g. source, sources). */
  linkProps: string[];
  /** Properties whose [[links]] point at files (e.g. file, pdf). Broken ones are reported. */
  fileProps: string[];
  /** Properties that identify a source externally (url, doi, isbn, citekey...). */
  identityProps: string[];
  /** A body wikilink to a note with the source role counts as a source. */
  bodyLinks: boolean;
  /** Count http(s) URLs in the note body as citation signals. */
  inlineUrls: boolean;
  footnotes: boolean;
  citekeys: boolean;
}

export interface ConventionSet {
  id: string;
  label: string;
  roles: RoleDefinition[];
  provenance: ProvenanceConfig;
  sourceRequirement: FieldRequirement;
  researchRequirement: FieldRequirement;
}
