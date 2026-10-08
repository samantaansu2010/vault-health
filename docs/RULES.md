# Rules reference

Generated from the code (`node scripts/gen-rules-doc.ts`). Every rule is deterministic, local, and read-only.
Wording is deliberately structural: rules report what the vault's links, properties and files show, never whether a claim or idea is right.

## Integrity tier

### Disconnected research clusters

- **Rule id:** `research.cluster.disconnected`
- **Dimension:** research · **Base severity:** medium
- **What it checks:** Connected groups containing research or source notes that have no link path to the largest connected group of the vault.
- **How it is phrased:** Worth checking whether this research area is intentionally separate or lacks links to related project notes.

### Research notes with no source

- **Rule id:** `research.note.no-source`
- **Dimension:** research · **Base severity:** high
- **What it checks:** Notes marked as research that have no recorded provenance: no link to a source note, no source property, and no citation signal. This checks that provenance exists, not whether the claims are correct.
- **How it is phrased:** Worth checking where these notes' material came from, and whether a source link belongs here.

### Citations without source metadata

- **Rule id:** `research.note.citation-no-metadata`
- **Dimension:** sources · **Base severity:** medium
- **What it checks:** Research notes that cite something in their text but do not record it as a source link or as source properties. The citations are detected heuristically from the note text.
- **How it is phrased:** Worth considering whether these references should be captured as source notes or properties.

### Broken source links

- **Rule id:** `research.source.broken-link`
- **Dimension:** sources · **Base severity:** high
- **What it checks:** Source or file properties (for example source: [[…]] or file: [[….pdf]]) whose target does not exist in the vault.
- **How it is phrased:** Worth checking whether the source note or file was renamed, moved, or never imported.

### Sources never referenced by research

- **Rule id:** `research.source.unreferenced`
- **Dimension:** sources · **Base severity:** medium
- **What it checks:** Source notes that no research note links to. They may be collected but not yet used.
- **How it is phrased:** Worth checking whether these sources have been read and used, or are still waiting to be processed.

### Duplicate sources

- **Rule id:** `research.source.duplicate`
- **Dimension:** sources · **Base severity:** medium
- **What it checks:** Source notes with the same URL, DOI, ISBN or citation key after normalization. Only exact identifier matches are reported; similar titles are not guessed at.
- **How it is phrased:** Worth comparing these notes to see whether they describe the same source.

### Sources missing metadata

- **Rule id:** `research.source.missing-metadata`
- **Dimension:** sources · **Base severity:** low
- **What it checks:** Source notes missing the properties required by your research conventions (Settings → Research conventions).
- **How it is phrased:** Worth filling in so the source can be located and cited later.

### Research notes missing metadata

- **Rule id:** `research.note.missing-metadata`
- **Dimension:** research · **Base severity:** low
- **What it checks:** Research notes missing properties your conventions require. Disabled until you list required properties.
- **How it is phrased:** Worth completing if you rely on these properties for filtering or review.

### Orphan research notes

- **Rule id:** `research.note.orphan`
- **Dimension:** research · **Base severity:** medium
- **What it checks:** Research notes disconnected from every other note, so they cannot be reached from your project structure.
- **How it is phrased:** Worth considering which question, project or source this note belongs with.

### PDFs with no associated note

- **Rule id:** `research.pdf.unreferenced`
- **Dimension:** sources · **Base severity:** medium
- **What it checks:** PDF files that no note links or embeds. Filename-based matching is not attempted, so a PDF referenced only by plain text is reported.
- **How it is phrased:** Worth checking whether these PDFs still need a source note.

### Artworks missing artist

- **Rule id:** `art.artwork.missing.artist`
- **Dimension:** visual · **Base severity:** low
- **What it checks:** Artwork records without artist. Which properties count is configurable (Art & Media field mapping).
- **How it is phrased:** Worth completing if you rely on this field for browsing, citing or provenance.

### Artworks missing year

- **Rule id:** `art.artwork.missing.year`
- **Dimension:** visual · **Base severity:** low
- **What it checks:** Artwork records without year. Which properties count is configurable (Art & Media field mapping).
- **How it is phrased:** Worth completing if you rely on this field for browsing, citing or provenance.

### Artworks missing medium

- **Rule id:** `art.artwork.missing.medium`
- **Dimension:** visual · **Base severity:** low
- **What it checks:** Artwork records without medium. Which properties count is configurable (Art & Media field mapping).
- **How it is phrased:** Worth completing if you rely on this field for browsing, citing or provenance.

### Artworks missing source

- **Rule id:** `art.artwork.missing.source`
- **Dimension:** sources · **Base severity:** medium
- **What it checks:** Artwork records without source. Which properties count is configurable (Art & Media field mapping).
- **How it is phrased:** Worth completing if you rely on this field for browsing, citing or provenance.

### Artworks missing image

- **Rule id:** `art.artwork.missing.image`
- **Dimension:** visual · **Base severity:** low
- **What it checks:** Artwork records without image. Which properties count is configurable (Art & Media field mapping).
- **How it is phrased:** Worth completing if you rely on this field for browsing, citing or provenance.

### Artworks with a broken image link

- **Rule id:** `art.artwork.broken-image`
- **Dimension:** visual · **Base severity:** high
- **What it checks:** The image property points at a file that does not exist in the vault. (Broken embeds in note text are reported separately under media.)
- **How it is phrased:** Worth checking whether the image was renamed, moved or never imported.

### Artworks with unreadable dates

- **Rule id:** `art.artwork.unparseable-date`
- **Dimension:** visual · **Base severity:** low
- **What it checks:** Dates are read only when written as a year, ISO date, decade (1880s), range, or with "c."/"ca.". Anything else (centuries, BCE, free text) is listed here, never guessed.
- **How it is phrased:** Worth rewriting in a readable form if you want it to appear in timelines.

## Structure tier

### Broken links

- **Rule id:** `structure.link.broken`
- **Dimension:** structure · **Base severity:** low
- **What it checks:** Links whose target note does not exist. Obsidian allows these as placeholders for future notes, so many are intentional; they are weighted gently and higher inside research and source notes.
- **How it is phrased:** Worth checking whether each target was renamed, deleted, or is a deliberate placeholder.

### Orphan notes

- **Rule id:** `knowledge.orphan`
- **Dimension:** knowledge · **Base severity:** low
- **What it checks:** Notes with no links in either direction. Research and source notes are reported separately under research integrity; empty notes under housekeeping. Substantial orphans rank above short ones.
- **How it is phrased:** Worth considering where each note belongs in your existing structure, or whether it is intentionally standalone.

### Isolated clusters

- **Rule id:** `knowledge.cluster.isolated`
- **Dimension:** knowledge · **Base severity:** medium
- **What it checks:** Groups of two or more notes connected to each other but with no link path to the largest connected group. This is a structural observation about links, not a judgment about the ideas.
- **How it is phrased:** Worth checking whether these groups are meant to stand apart or are missing a bridge to the rest of the vault.

### Broken embeds (missing attachments)

- **Rule id:** `visual.embed.broken`
- **Dimension:** visual · **Base severity:** medium
- **What it checks:** Images, PDFs or notes embedded with ![[…]] whose file does not exist. Visible as empty placeholders in reading view.
- **How it is phrased:** Worth checking whether the file was renamed, moved or deleted.

## Hygiene tier

### Dead-end notes

- **Rule id:** `knowledge.dead-end`
- **Dimension:** knowledge · **Base severity:** info
- **What it checks:** Notes that are linked to but link nowhere. Often perfectly normal (reference or leaf notes), so this is informational and carries low weight.
- **How it is phrased:** Only worth a look if you expect these notes to connect onward.

### Tags used only once

- **Rule id:** `hygiene.tag.singleton`
- **Dimension:** structure · **Base severity:** info
- **What it checks:** Obsidian only knows tags that appear in notes, so a truly unused tag cannot exist; tags used by a single note are the closest structural signal of stray or mistyped tags.
- **How it is phrased:** Informational: may be typos or one-off labels.

### Oversized notes

- **Rule id:** `hygiene.note.oversized`
- **Dimension:** structure · **Base severity:** info
- **What it checks:** Notes above the size threshold. Very long notes can be slow to edit and hard to link into.
- **How it is phrased:** Informational; long notes are sometimes intentional.

### Empty notes

- **Rule id:** `hygiene.note.empty`
- **Dimension:** structure · **Base severity:** info
- **What it checks:** Notes with no body content. They are often deliberate placeholders.
- **How it is phrased:** Informational.

### Unreferenced images, audio and video

- **Rule id:** `visual.asset.unreferenced`
- **Dimension:** visual · **Base severity:** low
- **What it checks:** Media files that no note links or embeds. They may be used from outside Obsidian (canvases, web publishing), so nothing is ever deleted automatically.
- **How it is phrased:** Worth checking before cleaning up: confirm they are not used somewhere Obsidian cannot see.

### Very large media files

- **Rule id:** `visual.asset.large`
- **Dimension:** visual · **Base severity:** info
- **What it checks:** Files above the large-file threshold. Large media affects sync time and backups.
- **How it is phrased:** Informational; relevant mainly if sync or backup is slow.

## Research Workspace rules

Evaluated per workspace on its member notes only. They are not part of the vault score; Ignore and Mark reviewed apply per workspace.

### Workspace notes that can no longer be found

- **Rule id:** `workspace.member.missing`
- **Base severity:** high
- **What it checks:** References in this workspace whose note does not exist at the stored path. Nothing was changed in your vault; only the reference is affected.
- **How it is phrased:** Worth relinking to the moved note, or removing the reference.

### Workspace notes not connected to the rest of the workspace

- **Rule id:** `workspace.member.isolated`
- **Base severity:** medium
- **What it checks:** Members with no internal connection. If they do connect to notes outside the workspace, "Add connected notes" may show the bridge.
- **How it is phrased:** Worth checking whether each belongs in this workspace.

### Workspace split into separate groups

- **Rule id:** `workspace.cluster.split`
- **Base severity:** medium
- **What it checks:** Groups of members connected to each other but not to the workspace's largest connected group. A structural observation, not a judgment about the topic.
- **How it is phrased:** Worth checking whether the groups are meant to be one topic, or are better as separate workspaces.

### Notes mostly connected outside the workspace

- **Rule id:** `workspace.member.external-heavy`
- **Base severity:** info
- **What it checks:** Members whose links mostly lead elsewhere. They may be gateways to related material.
- **How it is phrased:** Informational; "Add connected notes" lists what they connect to.

