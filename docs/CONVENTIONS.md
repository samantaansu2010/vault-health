# Research conventions

Vault Health does not impose a metadata system. You tell it how *you* mark research material; it then
checks the structure and provenance of that material. If nothing matches, the Research and Sources
dimensions show "—" and the dashboard says so; it never reports a perfect score for an empty category.

## Roles

A **role** is a name (`research`, `source`, `artwork`, or your own) plus a **match expression**.

| Matcher | Example | Matches |
|---|---|---|
| `property` | `{"kind":"property","key":"type","op":"equals","value":"source"}` | property value equals / contains / exists (keys case-insensitive; `[[links]]` and lists handled) |
| `tag` | `{"kind":"tag","tag":"research"}` | tag, including nested (`#research/history`) unless `includeNested:false` |
| `folder` | `{"kind":"folder","path":"Sources"}` | folder and sub-folders (`recursive:false` for exact) |
| `alias` | `{"kind":"alias","pattern":"* et al*"}` | any alias matching a glob (`*`) or `/regex/` |
| `filename` | `{"kind":"filename","pattern":"@*"}` | file name (without `.md`), glob or `/regex/` |

Combine with `{"any":[…]}`, `{"all":[…]}`, `{"not":…}`. Roles used by analyzers today: `research`, `source`
(and `artwork` for the Art & Media module).

## Provenance

How a research note points at its sources:

- `linkProps`: properties whose `[[links]]` are source pointers (default `source`, `sources`, `reference`, `references`).
- `fileProps`: properties whose `[[links]]` point at files such as PDFs (default `file`, `pdf`, `attachment`). Unresolved ones are reported as broken.
- `identityProps`: properties that identify a source externally (default `url`, `link`, `doi`, `isbn`, `citekey`, `zotero`). A research note carrying one counts as sourced.
- `bodyLinks`: a `[[wikilink]]` in the text to a note with the `source` role counts as a source.
- `inlineUrls`, `footnotes`, `citekeys`: citation signals in the text (URLs, `[^1]`, pandoc `[@key]`). These alone make a note **citation-only**, not sourced.

Every research note falls into exactly one status: **sourced**, **source link broken**, **citation-only**, or **no source found**.
Signals found in text are heuristic and the evidence always shows what was matched. If note text is not scanned
(setting off, or unreadable), findings say so and are ranked lower.

## Required metadata

`sourceRequirement` and `researchRequirement` each take `all` (every property must exist) and `any` (at least one).
Empty means the rule is disabled and the metric is not applicable. Default: a source needs at least one of
`url`, `doi`, `isbn`, `file`, `citekey`; research notes require nothing.

## Presets

Properties or tags (default) · Tags only · Folders (`Research/`, `Sources/`) · Literature notes (`@citekey` files, Zotero-style) · Custom.
Presets replace the roles with a starting point; edit them afterwards as JSON in Settings → Vault Health.
The settings page also shows live match counts per role and a read-only survey of the properties, tags and folders your vault already uses.

## Research areas (automatic analysis)

An **area** is a group of research and source notes connected by links among themselves. Role notes with no link
to another role note are collected in one "standalone" area. Areas are a structural approximation of a project,
not a claim about subject matter. Areas are not Research Workspaces: workspaces are created by you from notes you choose (see [WORKSPACES.md](WORKSPACES.md)) and reuse this same provenance analysis.
