# dev/ — sandbox-only shims

These files exist ONLY so the project can be typechecked in an environment that has no
`node_modules` (`tsc -p tsconfig.sandbox.json`). They are hand-written from memory of the
Obsidian API and are NOT authoritative. In a real checkout, `npm install` provides the real
`obsidian` and `@types/node` typings and `tsconfig.json` (which does not include `dev/`) is used.
If the real typings disagree with this shim, the real typings win — fix `src/`, not the shim.
