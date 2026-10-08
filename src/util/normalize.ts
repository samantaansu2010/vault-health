export function normTag(tag: string): string {
  return tag.trim().replace(/^#/, '').toLowerCase();
}

export function normKey(key: string): string {
  return key.trim().toLowerCase();
}

/** "[[Foo|bar]]" -> "Foo"; "[[Foo#Head]]" -> "Foo"; other strings returned trimmed. */
export function stripWikilink(s: string): string {
  const m = /^!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]$/.exec(s.trim());
  return (m ? (m[1] as string) : s).trim();
}

/** Glob with `*`, or a /regex/ literal. Case-insensitive. Invalid regex never matches. */
export function patternToRegExp(pattern: string): RegExp {
  const p = pattern.trim();
  if (p.length > 2 && p.startsWith('/') && p.endsWith('/')) {
    try {
      return new RegExp(p.slice(1, -1), 'i');
    } catch {
      return /$^/;
    }
  }
  const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i;

/** Canonical form used ONLY to detect exact duplicate sources. Returns null if not a URL. */
export function normalizeUrl(raw: string): string | null {
  const s = stripWikilink(raw).trim();
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    const u = new URL(s);
    u.hash = '';
    const keep: [string, string][] = [];
    u.searchParams.forEach((v, k) => {
      if (!TRACKING_PARAM.test(k)) keep.push([k, v]);
    });
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    const query = keep.length ? '?' + keep.map(([k, v]) => `${k}=${v}`).join('&') : '';
    return `${host}${path}${query}`;
  } catch {
    return null;
  }
}

export function normalizeDoi(raw: string): string | null {
  const m = /10\.\d{4,9}\/\S+/i.exec(raw.trim());
  return m ? m[0].toLowerCase().replace(/[.,;)]+$/, '') : null;
}

export function normalizeIsbn(raw: string): string | null {
  const digits = raw.replace(/[^0-9Xx]/g, '').toUpperCase();
  return digits.length === 10 || digits.length === 13 ? digits : null;
}

export function folderOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

/** Frontmatter values as a flat list of non-empty strings. */
export function propStrings(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  if (typeof v === 'string') return v.trim() ? [v] : [];
  if (typeof v === 'number' || typeof v === 'boolean') return [String(v)];
  if (Array.isArray(v)) return v.flatMap(propStrings);
  return [];
}

export function getProp(props: Record<string, unknown>, key: string): unknown {
  const k = normKey(key);
  for (const name of Object.keys(props)) if (normKey(name) === k) return props[name];
  return undefined;
}

export function hasProp(props: Record<string, unknown>, key: string): boolean {
  return propStrings(getProp(props, key)).length > 0;
}
