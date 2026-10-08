import type { AnalysisConfig } from '../model/settings.ts';
import type { RuleOutput, VaultSnapshot } from '../model/types.ts';
import { defaultYield } from '../util/chunk.ts';
import { buildContext, type AnalysisContext } from './context.ts';
import { brokenEmbeds, largeAssets, unreferencedMedia } from './rules/media.ts';
import { emptyNotes, oversizedNotes, singletonTags } from './rules/hygiene.ts';
import { researchRules } from './rules/research.ts';
import { brokenLinks, deadEndNotes, isolatedClusters, orphanNotes } from './rules/structure.ts';
import { analyzeProvenance, type ProvenanceResult } from './research/provenance.ts';
import { summarizeArt, type ArtSummary } from './art/artworks.ts';
import { artRules } from './rules/art.ts';

export interface AnalysisResult {
  outputs: RuleOutput[];
  ctx: AnalysisContext;
  provenance: ProvenanceResult;
  art: ArtSummary;
  stats: { notes: number; analyzedNotes: number; assets: number; researchNotes: number; artworks: number; sourceNotes: number; ms: number };
}

export interface EngineOptions {
  yieldFn?: () => Promise<void>;
  isCancelled?: () => boolean;
  now?: () => number;
}

/**
 * Runs every enabled rule. Each rule is a single linear pass (union-find / maps), and the engine
 * yields to the event loop between rules so a 50k-note vault does not freeze the UI.
 */
export async function runAnalysis(snapshot: VaultSnapshot, config: AnalysisConfig, opts: EngineOptions = {}): Promise<AnalysisResult | null> {
  const now = opts.now ?? (() => Date.now());
  const yieldFn = opts.yieldFn ?? defaultYield;
  const t0 = now();
  const ctx = buildContext(snapshot, config);
  const provenance = analyzeProvenance(ctx);
  const art = summarizeArt(ctx);
  const outputs: RuleOutput[] = [];
  const m = config.modules;

  const steps: (() => void)[] = [];
  if (m.structure) {
    steps.push(() => outputs.push(brokenLinks(ctx)));
    steps.push(() => outputs.push(orphanNotes(ctx)));
    steps.push(() => {
      const c = isolatedClusters(ctx);
      outputs.push(c.plain);
      if (m.research) outputs.push(c.research);
    });
  }
  if (m.research) steps.push(() => outputs.push(...researchRules(ctx, provenance)));
  if (m.media) steps.push(() => outputs.push(brokenEmbeds(ctx)));
  if (m.hygiene) {
    steps.push(() => outputs.push(deadEndNotes(ctx)));
    steps.push(() => outputs.push(singletonTags(ctx), oversizedNotes(ctx), emptyNotes(ctx)));
  }
  if (m.hygiene && m.media) steps.push(() => outputs.push(unreferencedMedia(ctx), largeAssets(ctx)));

  if (m.art) steps.push(() => outputs.push(...artRules(ctx, art)));

  for (const step of steps) {
    if (opts.isCancelled?.()) return null;
    step();
    await yieldFn();
  }
  return {
    outputs,
    ctx,
    provenance,
    art,
    stats: {
      notes: snapshot.notes.length,
      analyzedNotes: ctx.notes.length,
      assets: snapshot.assets.length,
      researchNotes: ctx.research.length,
      artworks: art.artworks.length,
      sourceNotes: ctx.sources.length,
      ms: now() - t0,
    },
  };
}
