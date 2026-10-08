# How Vault Health scores are computed

A score is a **diagnostic summary of structure**. It is not a judgment of your knowledge, your notes or your research.
Every number in the dashboard can be expanded to show how it was produced.

## Metrics

Each metric measures one rule as a **rate**:

```
rate        = affected / eligible
metricScore = 100 × (1 − min(1, rate / tolerance))
```

- **eligible**: how many things the rule could have flagged (e.g. research notes, links, source notes).
- **affected**: how many it did flag (counted in "units": a cluster counts as the notes inside it).
- **tolerance**: the rate at which the metric scores 0. A tolerance of 10% means a vault where 10% of eligible items are affected scores 0 on that metric; 5% scores 50.
- **weight**: how much the metric matters inside its dimension.

Worked example: 14 orphan notes out of 212 eligible → rate 6.6%, tolerance 10% → `100 × (1 − 0.66) = 34`.

### Rules that keep scores honest

1. **Not applicable ≠ perfect.** If nothing is eligible (no research notes, no embeds…), the metric is excluded and shown as "n/a". A dimension with no applicable metric shows "—".
2. **Minimum sample.** If `eligible` is below 5 (setting), the metric is shown but not scored ("insufficient data").
3. **Ignored findings are excluded from `affected`.** You explicitly accepted them. The UI always shows how many are ignored, and Maintenance exposes them.
4. **Reviewed findings stay counted.** Reviewing is not fixing. A review expires automatically if the note changes.
5. **Hygiene is capped.** Housekeeping metrics (tier `hygiene`) can contribute at most **20%** of a dimension, however many weights they carry. If only housekeeping metrics apply to a dimension, it receives no score.
6. **Everything is editable.** Tolerances and weights can be overridden in settings (`scoring.overrides`); the defaults below are starting points, not truths.

## Dimensions and overall score

```
dimension = (1 − hygieneShare) × weightedMean(core metrics) + hygieneShare × weightedMean(hygiene metrics)
hygieneShare = min(20%, hygieneWeight / totalWeight)
overall = Σ(dimensionWeight × dimensionScore) / Σ(dimensionWeight)   over dimensions that have a score
```

Dimension weights depend on the mode (editable):

| Dimension | Vault | Research | Art & Media |
|---|---|---|---|
| Knowledge | 20 | 15 | 15 |
| Research | 15 | 25 | 10 |
| Sources | 15 | 25 | 15 |
| Structure | 20 | 10 | 10 |
| Visual | 15 | 5 | 35 |
| Maintenance | 15 | 20 | 15 |

## Maintenance

Maintenance never looks at note content. It is computed only from your review state and issue history:

- **Review coverage**: share of open high/medium findings you have not yet reviewed.
- **Issue age**: share of open high/medium findings first seen more than N days ago (default 30).
- **Trend**: change versus the previous snapshot. Requires health history, which is not implemented yet, so it shows "n/a".

Issue age starts counting when the plugin first sees a finding; it does not know how old the problem is in your vault.

## Priority (what the Action Center shows first)

```
priority = tierWeight × severityWeight
tier:     integrity 3 · structure 2 · hygiene 1
severity: high 3 · medium 2 · low 1 · info 0.5
```

A finding group's severity is the highest severity among its open items. Housekeeping findings are collapsed by default.

## Metric catalog (defaults)

This table is generated from the code (`node scripts/gen-scoring-doc.ts`).

| Metric id | Dimension | Tier | Weight | Tolerance | What is measured |
|---|---|---|---|---|---|
| `knowledge.orphan` | knowledge | structure | 3 | 10% | Share of ordinary notes with no links in or out. |
| `knowledge.cluster.isolated` | knowledge | structure | 2 | 10% | Share of ordinary notes sitting in groups cut off from the main connected group. |
| `knowledge.dead-end` | knowledge | hygiene | 1 | 60% | Share of ordinary notes that are linked to but link nowhere (housekeeping; often normal). |
| `research.note.no-source` | research | integrity | 4 | 15% | Share of research notes with no recorded provenance at all. |
| `research.note.orphan` | research | integrity | 2 | 10% | Share of research notes with no links in or out. |
| `research.cluster.disconnected` | research | integrity | 2 | 15% | Share of research and source notes in groups cut off from the main connected group. |
| `research.note.missing-metadata` | research | integrity | 1 | 25% | Share of research notes missing required properties (only when you define requirements). |
| `research.note.citation-no-metadata` | sources | integrity | 2 | 20% | Share of research notes that cite things in text without recording a source. |
| `research.source.broken-link` | sources | integrity | 4 | 5% | Share of source/file pointers that do not resolve. |
| `research.source.unreferenced` | sources | integrity | 3 | 20% | Share of source notes no research note links to. |
| `research.source.duplicate` | sources | integrity | 2 | 10% | Share of source notes that duplicate another by exact identifier. |
| `research.source.missing-metadata` | sources | integrity | 2 | 25% | Share of source notes missing required properties. |
| `research.pdf.unreferenced` | sources | integrity | 1 | 20% | Share of PDFs no note links or embeds. |
| `structure.link.broken` | structure | structure | 3 | 15% | Share of links pointing to notes that do not exist. |
| `visual.embed.broken` | visual | structure | 3 | 5% | Share of embeds whose file cannot be found. |
| `visual.asset.unreferenced` | visual | hygiene | 1 | 30% | Share of images, audio and video no note references (housekeeping). |
| `visual.asset.large` | visual | hygiene | 1 | 5% | Share of attachments above the large-file threshold (housekeeping). |
| `hygiene.tag.singleton` | structure | hygiene | 1 | 50% | Share of tags used by a single note (housekeeping). |
| `hygiene.note.oversized` | structure | hygiene | 1 | 5% | Share of notes above the size threshold (housekeeping). |
| `hygiene.note.empty` | structure | hygiene | 1 | 5% | Share of notes with no content (housekeeping). |
| `art.artwork.missing.artist` | visual | integrity | 3 | 15% | Share of artwork records with no artist set. |
| `art.artwork.missing.year` | visual | integrity | 2 | 20% | Share of artwork records with no date. |
| `art.artwork.missing.medium` | visual | integrity | 2 | 25% | Share of artwork records with no medium. |
| `art.artwork.missing.movement` | maintenance | derived | 1 | 30% | Share of artwork records with no movement (only when you make it required). |
| `art.artwork.missing.period` | maintenance | derived | 1 | 30% | Share of artwork records with no period (only when you make it required). |
| `art.artwork.missing.source` | sources | integrity | 3 | 15% | Share of artwork records with no source or provenance. |
| `art.artwork.missing.image` | visual | integrity | 3 | 10% | Share of artwork records with no image property or embedded image. |
| `art.artwork.broken-image` | visual | integrity | 4 | 3% | Share of artwork records whose image link does not resolve. |
| `art.artwork.unparseable-date` | visual | integrity | 1 | 15% | Share of dated artwork records whose date cannot be read as a year. |
| `maintenance.review-coverage` | maintenance | derived | 3 | 100% | Share of open high/medium findings you have not yet reviewed. |
| `maintenance.issue-age` | maintenance | derived | 3 | 50% | Share of open high/medium findings first seen longer ago than the age limit. |
| `maintenance.trend` | maintenance | derived | 1 | 100% | Change versus the previous health snapshot (needs history, which is not available yet). |
