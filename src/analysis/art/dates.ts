export interface ParsedYear {
  year: number;
  /** True for "c. 1937", "1880s", ranges, or values with "?". The timeline must show these as approximate. */
  approx: boolean;
}

/**
 * Deterministic year parser for artwork dates. It only reads what is written and never guesses:
 * BCE, centuries ("19th century"), and free text return null and are listed as unparseable.
 * Accepted: 1937 · 1937-04-26 · c. 1937 · ca. 1937 · circa 1937 · 1937? · 1880s · 1880-1885 · 1880–85
 */
export function parseYear(raw: string): ParsedYear | null {
  let s = raw.trim();
  if (!s) return null;
  let approx = false;
  const pre = /^(?:circa|ca\.?|c\.?|~)\s*/i.exec(s);
  if (pre) {
    approx = true;
    s = s.slice(pre[0].length);
  }
  if (s.endsWith('?')) {
    approx = true;
    s = s.slice(0, -1).trim();
  }
  let m = /^(\d{3,4})s$/.exec(s);
  if (m) return { year: Number(m[1]), approx: true };
  m = /^(\d{3,4})-(\d{2})(?:-(\d{2}))?$/.exec(s);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && (m[3] === undefined || (Number(m[3]) >= 1 && Number(m[3]) <= 31))) {
    return { year: Number(m[1]), approx };
  }
  m = /^(\d{3,4})\s*[-–—]\s*(\d{1,4})$/.exec(s);
  if (m) return { year: Number(m[1]), approx: true };
  m = /^(\d{3,4})$/.exec(s);
  if (m) return { year: Number(m[1]), approx };
  return null;
}
