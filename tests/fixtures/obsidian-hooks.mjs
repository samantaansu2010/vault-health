// Test-only: maps the 'obsidian' import to a tiny runtime fake so VaultScanner can be exercised in Node.
export async function resolve(specifier, context, next) {
  if (specifier === 'obsidian') return { url: new URL('./obsidian-fake.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
