import type { BodySignals } from '../model/types.ts';

const FENCED = /^(```|~~~)[\s\S]*?^\1[^\n]*$/gm;
const INLINE_CODE = /`[^`\n]*`/g;
const URL_RE = /https?:\/\/[^\s<>"'\]\)]+/gi;
const FOOTNOTE_REF = /\[\^([^\]\s]+)\](?!:)/g;
const BRACKET_GROUP = /\[[^\]\n]*@[^\]\n]*\]/g;
const CITEKEY = /(^|[\s;\[,])-?@([A-Za-z0-9_][\w:.#$%&+?<>~/-]*)/g;

function trimUrl(u: string): string {
  return u.replace(/[.,;:!?]+$/, '');
}

/** Extracts citation signals from a note body (frontmatter already removed). Deterministic, regex-based, heuristic. */
export function extractBodySignals(text: string): BodySignals {
  const cleaned = text.replace(FENCED, '').replace(INLINE_CODE, '');
  const urls = new Set<string>();
  for (const m of cleaned.matchAll(URL_RE)) urls.add(trimUrl(m[0]));

  const footnoteIds = new Set<string>();
  for (const m of cleaned.matchAll(FOOTNOTE_REF)) footnoteIds.add(m[1] as string);

  const citekeys = new Set<string>();
  for (const g of cleaned.matchAll(BRACKET_GROUP)) {
    for (const m of g[0].matchAll(CITEKEY)) citekeys.add((m[2] as string).replace(/[.,;:]+$/, ''));
  }
  return { urls: [...urls], footnotes: footnoteIds.size, citekeys: [...citekeys] };
}
