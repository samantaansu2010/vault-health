declare module 'node:test' {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
}
declare module 'node:assert/strict' {
  const assert: {
    (v: unknown, msg?: string): asserts v;
    equal(a: unknown, b: unknown, msg?: string): void;
    notEqual(a: unknown, b: unknown, msg?: string): void;
    deepEqual(a: unknown, b: unknown, msg?: string): void;
    ok(v: unknown, msg?: string): asserts v;
    throws(fn: () => unknown, msg?: unknown): void;
  };
  export default assert;
}
declare module 'node:fs' {
  export function readFileSync(p: string, enc: 'utf8'): string;
  export function readdirSync(p: string): string[];
  export function statSync(p: string): { isDirectory(): boolean };
  export function mkdtempSync(p: string): string;
  export function writeFileSync(p: string, d: string): void;
}
declare module 'node:path' {
  export function join(...p: string[]): string;
}
declare module 'node:os' {
  export function tmpdir(): string;
}
declare module 'node:child_process' {
  export function execFileSync(cmd: string, args: string[], o?: { encoding: 'utf8' }): string;
}
declare const process: { argv: string[]; env: Record<string, string | undefined>; platform: string };
declare module 'node:module' {
  export function register(specifier: string, parent?: string): void;
}
