# Research Workspaces

A **Research Workspace** is a named, persistent, user-created set of **references** to notes that already exist in
your vault, for example "AI and Labor Economics" containing *AI*, *Automation*, *Labor*, *Economics*, *Productivity*
and *Employment*. It is a lens over those notes with its own graph, connection counts, clusters, sources and diagnostics.

## What a workspace is, and is not

- It **stores references** (vault paths and the date added), never copies of notes.
- **Closing** a workspace tab changes nothing. **Deleting** a workspace deletes only its name and its list of references
  (and the ignore/review decisions you made inside it). Notes are never touched.
- The same note can belong to any number of workspaces.
- It is not the same as **Research analysis**, which groups research and source notes automatically ("areas") across
  the whole vault. Analysis is the layer workspaces are built on; a workspace chooses *which* notes are in scope.

## Features

| | |
|---|---|
| Create / rename / open / delete | Command palette, the dashboard "Workspaces" button, or the workspace tab. Names are unique (case-insensitive). |
| Add existing notes | Search by name, path, alias or tag and tick notes. Or run **Add current note to a research workspace…** from any note. |
| Remove notes | Per row or in bulk. Removes the reference only. |
| Add connected notes | Notes outside the workspace linked to/from its notes, ranked by number of connected members. Broadly linked notes (indexes, hubs) are flagged. Link evidence only. |
| Workspace-local graph | Only member notes and the links between them. Keyboard-focusable; every node is also in the Notes table. Drawn for the 150 most connected notes on large workspaces. |
| Internal / external counts | **Internal**: links between members. **External**: links from members to other notes, and other notes linking in. Notes in excluded folders are not counted. |
| Clusters | Groups of members connected to each other; unconnected members listed separately. |
| Sources | Source notes that are members or are cited by members, with the same provenance statuses as the vault analysis. |
| Diagnostics | Workspace-level rules (see [RULES.md](RULES.md)) plus every vault-wide finding that touches a member note. |
| Multiple workspaces | Any number; each opens in its own tab, remembered across restarts. |

## Renamed, moved and deleted notes

- **Renamed or moved in Obsidian:** references follow automatically (including whole folders), and so do the ignore/review
  decisions made for those notes.
- **Deleted, or moved while Obsidian was closed:** the reference is **kept** and shown as "can no longer be found",
  with relink suggestions (existing notes with the same file name). Nothing is relinked or removed without you.
- **Restored later:** if a note reappears at the stored path the reference simply works again.

## Where the data lives

`data.json` of this plugin: for each workspace an id, a name, timestamps, and its note paths. See [DATA.md](DATA.md).
