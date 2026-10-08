import type { FindingItem, RuleOutput } from '../../model/types.ts';
import type { AnalysisContext } from '../context.ts';
import { degree } from '../graph.ts';
import { makeItem, output } from '../items.ts';
import { missingFields, requirementActive, type ProvenanceResult } from '../research/provenance.ts';

export function researchRules(ctx: AnalysisContext, prov: ProvenanceResult): RuleOutput[] {
  const cfg = ctx.config.conventions;
  const outs: RuleOutput[] = [];
  const nResearch = ctx.research.length;
  const nSources = ctx.sources.length;

  // 1. Research notes with no source of any kind
  {
    const ruleId = 'research.note.no-source';
    const items: FindingItem[] = [];
    for (const n of ctx.research) {
      const p = prov.research.get(n.path);
      if (!p || p.status !== 'unsourced') continue;
      items.push(
        makeItem(
          ruleId,
          [n.path],
          p.bodyKnown
            ? 'No link to a source note, no source property, and no URL, footnote or citation key was found in this note.'
            : 'No link to a source note and no source property were found. (Note text was not scanned for URLs or citations.)',
          [
            { label: 'Source links', value: 0 },
            { label: 'Source properties', value: cfg.provenance.identityProps.join(', ') || '—' },
            { label: 'Backlinks', value: (ctx.referencedBy.get(n.path)?.size ?? 0) },
          ],
          { severity: p.bodyKnown ? 'high' : 'medium' },
        ),
      );
    }
    outs.push(output({
      ruleId, tier: 'integrity', dimension: 'research', severity: 'high',
      title: 'Research notes with no source',
      description: 'Notes marked as research that have no recorded provenance: no link to a source note, no source property, and no citation signal. This checks that provenance exists, not whether the claims are correct.',
      suggestion: 'Worth checking where these notes\' material came from, and whether a source link belongs here.',
    }, items, nResearch));
  }

  // 2. Citation signals but no source metadata
  {
    const ruleId = 'research.note.citation-no-metadata';
    const items: FindingItem[] = [];
    for (const n of ctx.research) {
      const p = prov.research.get(n.path);
      if (!p || p.status !== 'citation-only') continue;
      const ev = [
        { label: 'URLs in text', value: p.signals.urls },
        { label: 'Footnote references', value: p.signals.footnotes },
        { label: 'Citation keys', value: p.signals.citekeys },
        ...(n.body?.urls.slice(0, 3).map((u) => ({ label: 'URL', value: u })) ?? []),
      ];
      items.push(makeItem(ruleId, [n.path],
        'The text cites URLs, footnotes or citation keys, but the note has no source link and no source metadata properties.', ev,
        { severity: 'medium' }));
    }
    outs.push(output({
      ruleId, tier: 'integrity', dimension: 'sources', severity: 'medium',
      title: 'Citations without source metadata',
      description: 'Research notes that cite something in their text but do not record it as a source link or as source properties. The citations are detected heuristically from the note text.',
      suggestion: 'Worth considering whether these references should be captured as source notes or properties.',
    }, items, nResearch));
  }

  // 3. Broken source / file pointers
  {
    const ruleId = 'research.source.broken-link';
    const items: FindingItem[] = [];
    const add = (path: string, broken: { key: string; raw: string }[], role: string) => {
      if (broken.length === 0) return;
      items.push(makeItem(ruleId, [path],
        `${broken.length} source/file pointer${broken.length === 1 ? '' : 's'} in this ${role} note do not resolve to an existing file.`,
        broken.slice(0, 8).map((b) => ({ label: `Property “${b.key}”`, value: b.raw })),
        { units: broken.length, severity: 'high' }));
    };
    for (const n of ctx.research) add(n.path, prov.research.get(n.path)?.brokenPointers ?? [], 'research');
    for (const s of ctx.sources) add(s.path, prov.sources.get(s.path)?.brokenPointers ?? [], 'source');
    outs.push(output({
      ruleId, tier: 'integrity', dimension: 'sources', severity: 'high',
      title: 'Broken source links',
      description: 'Source or file properties (for example source: [[…]] or file: [[….pdf]]) whose target does not exist in the vault.',
      suggestion: 'Worth checking whether the source note or file was renamed, moved, or never imported.',
    }, items, prov.pointerTotal));
  }

  // 4. Source notes nobody cites
  {
    const ruleId = 'research.source.unreferenced';
    const items: FindingItem[] = [];
    for (const s of ctx.sources) {
      const info = prov.sources.get(s.path);
      if (!info || info.referencedBy.length > 0) continue;
      items.push(makeItem(ruleId, [s.path],
        info.otherInbound === 0
          ? 'No note links to this source.'
          : 'No research note links to this source; only other kinds of notes do.',
        [
          { label: 'Research notes citing it', value: 0 },
          { label: 'Other inbound links', value: info.otherInbound },
        ],
        { severity: info.otherInbound === 0 ? 'medium' : 'low' }));
    }
    outs.push(output({
      ruleId, tier: 'integrity', dimension: 'sources', severity: 'medium',
      title: 'Sources never referenced by research',
      description: 'Source notes that no research note links to. They may be collected but not yet used.',
      suggestion: 'Worth checking whether these sources have been read and used, or are still waiting to be processed.',
    }, items, nSources));
  }

  // 5. Duplicate sources (exact normalized URL / DOI / ISBN / citekey match only)
  {
    const ruleId = 'research.source.duplicate';
    const byKey = new Map<string, Set<string>>();
    for (const [path, info] of prov.sources) {
      for (const id of info.identity) {
        const k = `${id.kind}:${id.value}`;
        let s = byKey.get(k);
        if (!s) byKey.set(k, (s = new Set()));
        s.add(path);
      }
    }
    const seen = new Set<string>();
    const items: FindingItem[] = [];
    for (const [key, set] of byKey) {
      if (set.size < 2) continue;
      const paths = [...set].sort();
      const sig = paths.join('\n');
      if (seen.has(sig)) continue;
      seen.add(sig);
      items.push(makeItem(ruleId, paths,
        `${paths.length} source notes share the same ${key.split(':')[0]}.`,
        [{ label: 'Shared identifier', value: key }, ...paths.map((p) => ({ label: 'Source note', value: p, path: p }))],
        { units: paths.length, severity: 'medium' }));
    }
    outs.push(output({
      ruleId, tier: 'integrity', dimension: 'sources', severity: 'medium',
      title: 'Duplicate sources',
      description: 'Source notes with the same URL, DOI, ISBN or citation key after normalization. Only exact identifier matches are reported; similar titles are not guessed at.',
      suggestion: 'Worth comparing these notes to see whether they describe the same source.',
    }, items, nSources));
  }

  // 6. Source metadata completeness
  {
    const ruleId = 'research.source.missing-metadata';
    const active = requirementActive(cfg.sourceRequirement);
    const items: FindingItem[] = [];
    if (active) {
      for (const s of ctx.sources) {
        const info = prov.sources.get(s.path);
        if (!info || info.missing.length === 0) continue;
        items.push(makeItem(ruleId, [s.path], 'This source note lacks metadata your conventions require.',
          info.missing.map((m) => ({ label: 'Missing', value: m })), { severity: 'low' }));
      }
    }
    outs.push(output({
      ruleId, tier: 'integrity', dimension: 'sources', severity: 'low',
      title: 'Sources missing metadata',
      description: 'Source notes missing the properties required by your research conventions (Settings → Research conventions).',
      suggestion: 'Worth filling in so the source can be located and cited later.',
    }, items, active ? nSources : 0));
  }

  // 7. Research note metadata completeness
  {
    const ruleId = 'research.note.missing-metadata';
    const active = requirementActive(cfg.researchRequirement);
    const items: FindingItem[] = [];
    if (active) {
      for (const n of ctx.research) {
        const miss = missingFields(n.props, cfg.researchRequirement);
        if (miss.length === 0) continue;
        items.push(makeItem(ruleId, [n.path], 'This research note lacks metadata your conventions require.',
          miss.map((m) => ({ label: 'Missing', value: m })), { severity: 'low' }));
      }
    }
    outs.push(output({
      ruleId, tier: 'integrity', dimension: 'research', severity: 'low',
      title: 'Research notes missing metadata',
      description: 'Research notes missing properties your conventions require. Disabled until you list required properties.',
      suggestion: 'Worth completing if you rely on these properties for filtering or review.',
    }, items, active ? nResearch : 0));
  }

  // 8. Orphan research notes
  {
    const ruleId = 'research.note.orphan';
    const items: FindingItem[] = [];
    let eligible = 0;
    ctx.notes.forEach((n, i) => {
      if (!n.roles.includes('research') || n.empty) return;
      eligible++;
      if (degree(ctx.graph, i) !== 0) return;
      items.push(makeItem(ruleId, [n.path], 'This research note has no links to, and no backlinks from, any other note.',
        [{ label: 'Outgoing note links', value: 0 }, { label: 'Backlinks', value: 0 }], { severity: 'medium' }));
    });
    outs.push(output({
      ruleId, tier: 'integrity', dimension: 'research', severity: 'medium',
      title: 'Orphan research notes',
      description: 'Research notes disconnected from every other note, so they cannot be reached from your project structure.',
      suggestion: 'Worth considering which question, project or source this note belongs with.',
    }, items, eligible));
  }

  // 9. PDFs nobody references
  {
    const ruleId = 'research.pdf.unreferenced';
    const items: FindingItem[] = [];
    let eligible = 0;
    for (const a of ctx.assets) {
      if (a.kind !== 'pdf') continue;
      eligible++;
      if ((ctx.referencedBy.get(a.path)?.size ?? 0) > 0) continue;
      items.push(makeItem(ruleId, [a.path], 'No note links to or embeds this PDF.',
        [{ label: 'Size', value: `${Math.round(a.size / 1024)} KB` }, { label: 'Folder', value: a.folder || '(vault root)' }],
        { severity: 'medium' }));
    }
    outs.push(output({
      ruleId, tier: 'integrity', dimension: 'sources', severity: 'medium',
      title: 'PDFs with no associated note',
      description: 'PDF files that no note links or embeds. Filename-based matching is not attempted, so a PDF referenced only by plain text is reported.',
      suggestion: 'Worth checking whether these PDFs still need a source note.',
    }, items, eligible));
  }

  return outs;
}
