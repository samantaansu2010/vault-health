import type { NoteFacts } from '../model/types.ts';
import { propStrings } from '../util/normalize.ts';

export interface DiscoveredProperty {
  key: string;
  count: number;
  topValues: { value: string; count: number }[];
}
export interface Discovery {
  properties: DiscoveredProperty[];
  tags: { tag: string; count: number }[];
  folders: { folder: string; count: number }[];
}

/**
 * Read-only survey of what conventions the vault already uses, so the user can pick roles from real data.
 * It never configures anything on its own.
 */
export function discoverConventions(notes: readonly NoteFacts[], limit = 25): Discovery {
  const props = new Map<string, { count: number; values: Map<string, number> }>();
  const tags = new Map<string, number>();
  const folders = new Map<string, number>();
  for (const n of notes) {
    for (const key of Object.keys(n.props)) {
      if (key === 'position') continue;
      let e = props.get(key);
      if (!e) props.set(key, (e = { count: 0, values: new Map() }));
      e.count++;
      for (const v of propStrings(n.props[key])) {
        if (v.length <= 60) e.values.set(v, (e.values.get(v) ?? 0) + 1);
      }
    }
    for (const t of n.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
    const top = n.folder.split('/')[0] ?? '';
    folders.set(top, (folders.get(top) ?? 0) + 1);
  }
  const desc = <T extends { count: number }>(a: T, b: T) => b.count - a.count;
  return {
    properties: [...props.entries()]
      .map(([key, e]) => ({
        key,
        count: e.count,
        topValues: e.values.size <= 25
          ? [...e.values.entries()].map(([value, count]) => ({ value, count })).sort(desc).slice(0, 5)
          : [],
      }))
      .sort(desc)
      .slice(0, limit),
    tags: [...tags.entries()].map(([tag, count]) => ({ tag, count })).sort(desc).slice(0, limit),
    folders: [...folders.entries()].map(([folder, count]) => ({ folder: folder || '(vault root)', count })).sort(desc).slice(0, limit),
  };
}
