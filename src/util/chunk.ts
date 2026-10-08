export interface ChunkOptions {
  /** Max milliseconds of continuous work before yielding to the UI thread. */
  budgetMs?: number;
  isCancelled?: () => boolean;
  onProgress?: (done: number, total: number) => void;
  /** Injectable for tests. */
  now?: () => number;
  yieldFn?: () => Promise<void>;
}

export const defaultYield = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Iterates in time slices so a large vault never blocks the UI for longer than `budgetMs`.
 * Returns false when cancelled before completion.
 */
export async function forEachChunked<T>(
  items: readonly T[],
  fn: (item: T, index: number) => void | Promise<void>,
  options: ChunkOptions = {},
): Promise<boolean> {
  const budget = options.budgetMs ?? 12;
  const now = options.now ?? (() => performance.now());
  const yieldFn = options.yieldFn ?? defaultYield;
  let sliceStart = now();
  for (let i = 0; i < items.length; i++) {
    if (options.isCancelled?.()) return false;
    const r = fn(items[i] as T, i);
    if (r) await r;
    if (now() - sliceStart >= budget) {
      options.onProgress?.(i + 1, items.length);
      await yieldFn();
      sliceStart = now();
    }
  }
  options.onProgress?.(items.length, items.length);
  return !(options.isCancelled?.() ?? false);
}
