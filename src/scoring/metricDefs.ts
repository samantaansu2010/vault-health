export interface MetricDef {
  id: string;
  label: string;
  weight: number;
  /** The affected rate at (or above) which the metric scores 0. */
  tolerance: number;
  explain: string;
}

const d = (id: string, label: string, weight: number, tolerance: number, explain: string): [string, MetricDef] => [
  id, { id, label, weight, tolerance, explain },
];

/** Defaults documented in docs/SCORING.md. Editable via settings (scoring.overrides). */
export const METRICS: Record<string, MetricDef> = Object.fromEntries([
  d('knowledge.orphan', 'Orphan notes', 3, 0.10, 'Share of ordinary notes with no links in or out.'),
  d('knowledge.cluster.isolated', 'Notes in isolated clusters', 2, 0.10, 'Share of ordinary notes sitting in groups cut off from the main connected group.'),
  d('knowledge.dead-end', 'Dead-end notes', 1, 0.60, 'Share of ordinary notes that are linked to but link nowhere (housekeeping; often normal).'),
  d('research.note.no-source', 'Research notes with a source', 4, 0.15, 'Share of research notes with no recorded provenance at all.'),
  d('research.note.orphan', 'Connected research notes', 2, 0.10, 'Share of research notes with no links in or out.'),
  d('research.cluster.disconnected', 'Research notes in disconnected clusters', 2, 0.15, 'Share of research and source notes in groups cut off from the main connected group.'),
  d('research.note.missing-metadata', 'Research metadata completeness', 1, 0.25, 'Share of research notes missing required properties (only when you define requirements).'),
  d('research.note.citation-no-metadata', 'Citations recorded as metadata', 2, 0.20, 'Share of research notes that cite things in text without recording a source.'),
  d('research.source.broken-link', 'Working source links', 4, 0.05, 'Share of source/file pointers that do not resolve.'),
  d('research.source.unreferenced', 'Sources used by research', 3, 0.20, 'Share of source notes no research note links to.'),
  d('research.source.duplicate', 'Unique sources', 2, 0.10, 'Share of source notes that duplicate another by exact identifier.'),
  d('research.source.missing-metadata', 'Source metadata completeness', 2, 0.25, 'Share of source notes missing required properties.'),
  d('research.pdf.unreferenced', 'PDFs with a note', 1, 0.20, 'Share of PDFs no note links or embeds.'),
  d('structure.link.broken', 'Working links', 3, 0.15, 'Share of links pointing to notes that do not exist.'),
  d('visual.embed.broken', 'Working embeds', 3, 0.05, 'Share of embeds whose file cannot be found.'),
  d('visual.asset.unreferenced', 'Referenced media', 1, 0.30, 'Share of images, audio and video no note references (housekeeping).'),
  d('visual.asset.large', 'Moderate file sizes', 1, 0.05, 'Share of attachments above the large-file threshold (housekeeping).'),
  d('hygiene.tag.singleton', 'Tags used more than once', 1, 0.50, 'Share of tags used by a single note (housekeeping).'),
  d('hygiene.note.oversized', 'Note sizes', 1, 0.05, 'Share of notes above the size threshold (housekeeping).'),
  d('hygiene.note.empty', 'Non-empty notes', 1, 0.05, 'Share of notes with no content (housekeeping).'),
  d('art.artwork.missing.artist', 'Artworks with an artist', 3, 0.15, 'Share of artwork records with no artist set.'),
  d('art.artwork.missing.year', 'Artworks with a year', 2, 0.20, 'Share of artwork records with no date.'),
  d('art.artwork.missing.medium', 'Artworks with a medium', 2, 0.25, 'Share of artwork records with no medium.'),
  d('art.artwork.missing.movement', 'Artworks with a movement', 1, 0.30, 'Share of artwork records with no movement (only when you make it required).'),
  d('art.artwork.missing.period', 'Artworks with a period', 1, 0.30, 'Share of artwork records with no period (only when you make it required).'),
  d('art.artwork.missing.source', 'Artworks with a source', 3, 0.15, 'Share of artwork records with no source or provenance.'),
  d('art.artwork.missing.image', 'Artworks with an image', 3, 0.10, 'Share of artwork records with no image property or embedded image.'),
  d('art.artwork.broken-image', 'Artworks with a working image', 4, 0.03, 'Share of artwork records whose image link does not resolve.'),
  d('art.artwork.unparseable-date', 'Artworks with a readable date', 1, 0.15, 'Share of dated artwork records whose date cannot be read as a year.'),
  d('maintenance.review-coverage', 'Review coverage', 3, 1.0, 'Share of open high/medium findings you have not yet reviewed.'),
  d('maintenance.issue-age', 'Issue age', 3, 0.5, 'Share of open high/medium findings first seen longer ago than the age limit.'),
  d('maintenance.trend', 'Trend', 1, 1.0, 'Change versus the previous health snapshot (needs history, which is not available yet).'),
]);
