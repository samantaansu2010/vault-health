# What Vault Health stores, and why

**Nothing leaves your device.** The plugin makes no network requests, uses no AI service, and collects no telemetry.
(A test in the repository fails the build if network APIs appear in `src/`.)

**Nothing in your vault is modified.** A test also fails the build if `src/` references any vault-writing API.
Opening a note from a finding is the only interaction with your files, and it only opens it.

## `data.json` (in this plugin's folder)

| Stored | Why |
|---|---|
| Settings: modules, conventions, exclusions, thresholds, scoring overrides | your configuration |
| For findings you **ignored** or **reviewed**: rule id, up to 20 file paths, status, timestamps, optional note | so decisions persist across scans; a review expires if the note changes |
| **Research Workspaces**: for each workspace an id, its name, created/updated times, and the paths (with added-dates) of the notes you put in it | so workspaces persist; deleting a workspace removes exactly this |
| For **high/medium** findings: first-seen timestamp (same record) | the Maintenance "issue age" metric |

Records disappear when the issue is gone (open ones immediately; ignored/reviewed after 90 days unseen).
No note text, titles beyond file paths, or properties are stored.

## In memory only

The snapshot of your vault's structure (links, tags, properties, sizes) and all analysis results are rebuilt from
Obsidian's own index each scan and discarded when the plugin unloads. A per-file cache of citation signals (URLs,
footnote counts, citation keys) for research/source notes avoids re-reading unchanged files; it is not persisted.

## Not implemented yet

Health history snapshots (opt-in, scores only) are planned; the setting exists but does nothing yet.
