# Vault Health

A **local-first diagnostic** for Obsidian vaults. It answers: *what is structurally happening inside my knowledge system, and what deserves my attention?*, not "how tidy are my Markdown files?"

- **Research integrity**: which research notes have recorded sources, which sources are never used, broken source links, duplicate sources, citations without metadata, disconnected research clusters.
- **Art & Media**: artwork records read through a configurable field mapping: artists, movements, periods, mediums, missing metadata, broken image links, unreadable dates.
- **Research Workspaces**: create named, persistent workspaces from notes you choose (references, never copies), each with a local graph, internal/external connection counts, clusters, associated sources and diagnostics. See [docs/WORKSPACES.md](docs/WORKSPACES.md).
- **Research analysis**: the automatic layer underneath: provenance of every research note across the vault, grouped into areas.
- **Knowledge structure**: broken links, orphan notes, isolated clusters, dead ends.
- **Media**: broken embeds, unreferenced PDFs, images, audio and video.
- **Transparent scores**: every number expands to affected, eligible, tolerance, weight and formula. A score is a diagnostic summary, not a verdict.
- **Action Center**: ranked findings, each with a reason, evidence, and Open / Inspect / Ignore / Mark reviewed. Housekeeping (singleton tags, oversized or empty notes) is secondary and collapsed.

**Read-only. No AI. No network. No telemetry.** It never edits, moves, renames or deletes anything.
See [docs/DATA.md](docs/DATA.md), [docs/SCORING.md](docs/SCORING.md), [docs/RULES.md](docs/RULES.md), [docs/CONVENTIONS.md](docs/CONVENTIONS.md), [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Status (v0.1.0, MVP)

Implemented: scanner, convention engine, link structure, research integrity, Research Workspaces (create/rename/open/delete, add/remove notes, add connected, local graph, clusters, sources, diagnostics), research analysis, Art & Media (records, facets, metadata, images), basic media health,
scoring, Action Center, settings. Planned next: art timeline, knowledge-graph analysis (bridges, centrality),
duplicate/fragmentation analysis, art timeline, opt-in health history.
