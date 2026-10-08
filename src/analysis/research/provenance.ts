import { hasRole } from '../../conventions/roles.ts';
import type { FieldRequirement, ProvenanceConfig } from '../../model/conventions.ts';
import type { NoteFacts } from '../../model/types.ts';
import { getProp, hasProp, normalizeDoi, normalizeIsbn, normalizeUrl, normKey, propStrings } from '../../util/normalize.ts';
import type { AnalysisContext } from '../context.ts';

export type ProvenanceStatus = 'sourced' | 'broken-only' | 'citation-only' | 'unsourced';

export interface Identity {
  kind: string;
  value: string;
}

export interface NoteProvenance {
  path: string;
  status: ProvenanceStatus;
  /** Resolved source pointers (source-role notes or property-linked notes). */
  sourceTargets: string[];
  brokenPointers: { key: string; raw: string }[];
  identity: Identity[];
  signals: { urls: number; footnotes: number; citekeys: number };
  /** False when the note text was not scanned, so citation signals are unknown. */
  bodyKnown: boolean;
}

export interface SourceInfo {
  path: string;
  /** Research-role notes that link to this source. */
  referencedBy: string[];
  /** Inbound links from notes that are not research notes. */
  otherInbound: number;
  identity: Identity[];
  missing: string[];
  brokenPointers: { key: string; raw: string }[];
}

export interface ProvenanceResult {
  research: Map<string, NoteProvenance>;
  sources: Map<string, SourceInfo>;
  /** Count of configured source/file pointers across research+source notes (denominator for broken-pointer metric). */
  pointerTotal: number;
}

export function identityOf(props: Record<string, unknown>, identityProps: readonly string[]): Identity[] {
  const out: Identity[] = [];
  const seen = new Set<string>();
  for (const key of identityProps) {
    const k = normKey(key);
    for (const raw of propStrings(getProp(props, key))) {
      let kind = k;
      let value: string | null;
      if (k.includes('doi')) {
        kind = 'doi';
        value = normalizeDoi(raw);
      } else if (k.includes('isbn')) {
        kind = 'isbn';
        value = normalizeIsbn(raw);
      } else if (['url', 'link', 'website', 'href'].includes(k)) {
        kind = 'url';
        value = normalizeUrl(raw);
      } else {
        value = raw.trim().toLowerCase();
      }
      if (!value) value = raw.trim().toLowerCase();
      const id = `${kind}:${value}`;
      if (!seen.has(id)) {
        seen.add(id);
        out.push({ kind, value });
      }
    }
  }
  return out;
}

export function missingFields(props: Record<string, unknown>, req: FieldRequirement): string[] {
  const missing = req.all.filter((k) => !hasProp(props, k));
  if (req.any.length > 0 && !req.any.some((k) => hasProp(props, k))) missing.push(`one of: ${req.any.join(', ')}`);
  return missing;
}

export function requirementActive(req: FieldRequirement): boolean {
  return req.all.length > 0 || req.any.length > 0;
}

function pointers(n: NoteFacts, cfg: ProvenanceConfig) {
  const link = new Set(cfg.linkProps.map(normKey));
  const file = new Set(cfg.fileProps.map(normKey));
  const resolved: string[] = [];
  const broken: { key: string; raw: string }[] = [];
  let total = 0;
  for (const p of n.propLinks) {
    const k = normKey(p.key);
    const isLink = link.has(k);
    if (!isLink && !file.has(k)) continue;
    total++;
    if (p.target === null) broken.push({ key: p.key, raw: p.raw });
    else if (isLink) resolved.push(p.target);
  }
  return { resolved, broken, total };
}

export function analyzeProvenance(ctx: AnalysisContext): ProvenanceResult {
  const cfg = ctx.config.conventions.provenance;
  const sourcePaths = new Set(ctx.sources.map((s) => s.path));
  const research = new Map<string, NoteProvenance>();
  const sources = new Map<string, SourceInfo>();
  let pointerTotal = 0;

  for (const n of ctx.research) {
    const ptr = pointers(n, cfg);
    pointerTotal += ptr.total;
    const targets = new Set<string>(ptr.resolved);
    if (cfg.bodyLinks) for (const t of n.links) if (sourcePaths.has(t)) targets.add(t);
    const identity = identityOf(n.props, cfg.identityProps);
    const body = n.body;
    const signals = {
      urls: cfg.inlineUrls && body ? body.urls.length : 0,
      footnotes: cfg.footnotes && body ? body.footnotes : 0,
      citekeys: cfg.citekeys && body ? body.citekeys.length : 0,
    };
    let status: ProvenanceStatus;
    if (targets.size > 0 || identity.length > 0) status = 'sourced';
    else if (ptr.broken.length > 0) status = 'broken-only';
    else if (signals.urls + signals.footnotes + signals.citekeys > 0) status = 'citation-only';
    else status = 'unsourced';
    research.set(n.path, {
      path: n.path,
      status,
      sourceTargets: [...targets].sort(),
      brokenPointers: ptr.broken,
      identity,
      signals,
      bodyKnown: body !== undefined,
    });
  }

  for (const s of ctx.sources) {
    const ptr = pointers(s, cfg);
    pointerTotal += ptr.total;
    const inbound = ctx.referencedBy.get(s.path) ?? new Set<string>();
    const referencedBy: string[] = [];
    let otherInbound = 0;
    for (const p of inbound) {
      if (p === s.path) continue;
      const other = ctx.byPath.get(p);
      if (other && hasRole(other, 'research')) referencedBy.push(p);
      else otherInbound++;
    }
    sources.set(s.path, {
      path: s.path,
      referencedBy: referencedBy.sort(),
      otherInbound,
      identity: identityOf(s.props, cfg.identityProps),
      missing: missingFields(s.props, ctx.config.conventions.sourceRequirement),
      brokenPointers: ptr.broken,
    });
  }
  return { research, sources, pointerTotal };
}
