# Development

Requires Node ≥ 22.18 (tests run TypeScript natively; no test framework needed).

```
npm install
npm run typecheck        # tsc against the REAL obsidian typings
npm test                 # unit tests for every pure layer + scanner (fake Obsidian runtime)
npm run check-api        # computes minAppVersion from @since tags in obsidian.d.ts
npm run build            # typecheck + esbuild -> main.js
```

## Architecture

```
Obsidian index → VaultScanner (src/index) → VaultSnapshot (plain data)
  → convention engine (roles) → analyzers (src/analysis, pure) → RuleOutput[]
  → IssueRegistry (state) → HealthScorer / priority → UI (src/ui)
```

`src/model`, `util`, `conventions`, `analysis`, `scoring`, `registry`, `workspace` never import `obsidian` (enforced by a test).
Only `index/VaultScanner.ts`, `controller.ts`, `settings/SettingsTab.ts`, `ui/` and `main.ts` touch the API.

## Verification still required in a real checkout

This code was developed in an environment without the real `obsidian` package, so the Obsidian-facing files
(`VaultScanner`, `controller`, `ui/*`, `settings/SettingsTab`, `main`; the workspace logic in `src/workspace/` is pure and fully tested, but its views `src/ui/workspace/*` have never been rendered) were typechecked only against hand-written
shims in `dev/` (see `dev/README.md`). On first checkout:

1. `npm install && npm run typecheck`: fix any signature differences against the real typings (the real typings win).
2. `npm run check-api -- --write`: sets `minAppVersion` from the APIs actually used. `manifest.json` currently holds a provisional 1.4.0.
3. `npm run build`, copy `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/vault-health/`, and try it on a real vault, including a mobile device.
4. Add any newly used `app.*` member to `scripts/obsidian-members.txt` so the version check sees it.
5. Performance: the analysis core handles 20k synthetic notes in under a second here; measure the scan phase on your largest vault.

## Adding a rule

1. Write `(ctx) => RuleOutput` in `src/analysis/rules/` using `makeItem` / `output`.
2. Register it in `AnalysisEngine.ts` under the right module.
3. Add its metric to `src/scoring/metricDefs.ts` (weight, tolerance, explanation).
4. Regenerate docs: `node scripts/gen-scoring-doc.ts` / `gen-rules-doc.ts`; tests fail if the catalog and `docs/SCORING.md` disagree.

## Workspace architecture

```
src/workspace/
  model/        WorkspaceDef (references), errors
  core/         WorkspaceManager (CRUD, rename/move migration, defensive load), resolveScope
  graph/        local graph (internal/external, clusters), deterministic layout
  discovery/    add-connected candidates, relink suggestions
  sources/      sources associated with a scope (reuses vault provenance)
  diagnostics/  workspace-level rules (registry-compatible)
  stats/        workspace statistics
  integration/  analyzeWorkspace (vault analysis → scope), rename/delete lifecycle
src/analysis/research/{provenance,rows,areas}.ts   research analysis layer (rows are shared)
```
