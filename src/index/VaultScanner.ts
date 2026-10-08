import { getAllTags, getLinkpath, parseFrontMatterAliases, type App, type CachedMetadata, type TFile } from 'obsidian';
import { extractBodySignals } from '../conventions/body.ts';
import { assignRoles } from '../conventions/roles.ts';
import type { AnalysisConfig } from '../model/settings.ts';
import type { AssetFacts, AssetKind, BodySignals, NoteFacts, PropLink, VaultSnapshot } from '../model/types.ts';
import { forEachChunked } from '../util/chunk.ts';
import { folderOf, normTag } from '../util/normalize.ts';

export interface ScanProgress {
  phase: 'notes' | 'bodies' | 'assets';
  done: number;
  total: number;
}

export interface ScanOptions {
  budgetMs: number;
  scanBodies: boolean;
  isCancelled: () => boolean;
  onProgress: (p: ScanProgress) => void;
}

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'avif', 'tif', 'tiff', 'heic']);
const AUDIO = new Set(['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'webm_audio']);
const VIDEO = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi', 'ogv']);

export function assetKind(ext: string): AssetKind {
  const e = ext.toLowerCase();
  if (IMAGE.has(e)) return 'image';
  if (e === 'pdf') return 'pdf';
  if (AUDIO.has(e)) return 'audio';
  if (VIDEO.has(e)) return 'video';
  return 'other';
}

const WIKILINK = /!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;

/** Reads Obsidian's own index; it never writes to the vault. */
export class VaultScanner {
  private app: App;
  /** Body signals are the only expensive per-file work, so they are cached by mtime+size. */
  private bodyCache = new Map<string, { mtime: number; size: number; signals: BodySignals }>();

  constructor(app: App) {
    this.app = app;
  }

  /** Returns null if cancelled. */
  async scan(config: AnalysisConfig, opts: ScanOptions): Promise<VaultSnapshot | null> {
    const { vault, metadataCache } = this.app;
    const files = vault.getMarkdownFiles();
    const notes: NoteFacts[] = [];
    const fileOf = new Map<string, TFile>();
    const cacheOf = new Map<string, CachedMetadata | null>();
    const chunk = { budgetMs: opts.budgetMs, isCancelled: opts.isCancelled };

    const okNotes = await forEachChunked(files, (file) => {
      const cache = metadataCache.getFileCache(file);
      const facts = this.noteFacts(file, cache);
      notes.push(facts);
      fileOf.set(file.path, file);
      cacheOf.set(file.path, cache);
    }, { ...chunk, onProgress: (done, total) => opts.onProgress({ phase: 'notes', done, total }) });
    if (!okNotes) return null;

    assignRoles(notes, config.conventions.roles);

    if (opts.scanBodies && config.modules.research) {
      const targets = notes.filter((n) => n.roles.includes('research') || n.roles.includes('source'));
      const okBodies = await forEachChunked(targets, async (n) => {
        const file = fileOf.get(n.path);
        if (!file) return;
        const hit = this.bodyCache.get(n.path);
        if (hit && hit.mtime === n.mtime && hit.size === n.size) {
          n.body = hit.signals;
          return;
        }
        try {
          const text = await vault.cachedRead(file);
          const offset = cacheOf.get(n.path)?.frontmatterPosition?.end.offset ?? 0;
          const signals = extractBodySignals(text.slice(offset));
          this.bodyCache.set(n.path, { mtime: n.mtime, size: n.size, signals });
          n.body = signals;
        } catch {
          /* unreadable file: leave body undefined so findings say "text not scanned" */
        }
      }, { ...chunk, onProgress: (done, total) => opts.onProgress({ phase: 'bodies', done, total }) });
      if (!okBodies) return null;
      const live = new Set(notes.map((n) => n.path));
      for (const k of this.bodyCache.keys()) if (!live.has(k)) this.bodyCache.delete(k);
    }

    const assets: AssetFacts[] = [];
    const okAssets = await forEachChunked(vault.getFiles(), (f) => {
      if (f.extension === 'md') return;
      assets.push({
        path: f.path, name: f.name, ext: f.extension.toLowerCase(), kind: assetKind(f.extension),
        size: f.stat.size, mtime: f.stat.mtime, folder: folderOf(f.path),
      });
    }, { ...chunk, onProgress: (done, total) => opts.onProgress({ phase: 'assets', done, total }) });
    if (!okAssets) return null;

    return { notes, assets, takenAt: Date.now() };
  }

  private noteFacts(file: TFile, cache: CachedMetadata | null): NoteFacts {
    const { metadataCache } = this.app;
    const resolved = metadataCache.resolvedLinks[file.path] ?? {};
    const unresolvedAll = Object.keys(metadataCache.unresolvedLinks[file.path] ?? {});

    // Embeds: resolve each one so broken embeds can be told apart from broken links.
    const embeds = (cache?.embeds ?? []).map((e) => {
      const linkpath = getLinkpath(e.link);
      const dest = metadataCache.getFirstLinkpathDest(linkpath, file.path);
      return { raw: e.link, linkpath, target: dest?.path ?? null };
    });
    const brokenEmbedPaths = new Set(embeds.filter((e) => e.target === null).map((e) => e.linkpath));
    const unresolved = unresolvedAll.filter((u) => !brokenEmbedPaths.has(u));

    // Frontmatter wikilinks are parsed here (not via frontmatterLinks) to keep the minimum Obsidian version low.
    const props: Record<string, unknown> = {};
    const propLinks: PropLink[] = [];
    const fm = cache?.frontmatter;
    if (fm) {
      for (const key of Object.keys(fm)) {
        if (key === 'position') continue;
        props[key] = fm[key];
        collectStrings(fm[key], (s) => {
          for (const m of s.matchAll(WIKILINK)) {
            const raw = (m[1] as string).trim();
            const dest = metadataCache.getFirstLinkpathDest(raw, file.path);
            propLinks.push({ key, raw, target: dest?.path ?? null });
          }
        });
      }
    }

    const links = new Set<string>(Object.keys(resolved));
    for (const p of propLinks) if (p.target) links.add(p.target);
    links.delete(file.path);

    const fmEnd = cache?.frontmatterPosition?.end.offset;
    const empty = file.stat.size === 0 || (fmEnd !== undefined && file.stat.size - fmEnd <= 2);

    const tags = new Set<string>();
    for (const t of (cache ? getAllTags(cache) : null) ?? []) tags.add(normTag(t));

    return {
      path: file.path,
      basename: file.basename,
      folder: folderOf(file.path),
      mtime: file.stat.mtime,
      size: file.stat.size,
      links: [...links],
      unresolved,
      embeds: embeds.map((e) => ({ raw: e.raw, target: e.target })),
      propLinks,
      tags: [...tags],
      aliases: parseFrontMatterAliases(fm) ?? [],
      props,
      empty,
      roles: [],
    };
  }
}

function collectStrings(v: unknown, cb: (s: string) => void): void {
  if (typeof v === 'string') cb(v);
  else if (Array.isArray(v)) v.forEach((x) => collectStrings(x, cb));
}
