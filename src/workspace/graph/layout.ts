export interface Layout {
  /** Positions normalized to [0.05, 0.95]. */
  x: number[];
  y: number[];
}

/**
 * Deterministic Fruchterman–Reingold layout (no randomness: same graph, same picture). O(iterations × n²),
 * so callers cap n (see selectGraphNodes); at n = 150 and 120 iterations this is ~2.7M cheap steps.
 */
export function layoutGraph(n: number, edges: readonly (readonly [number, number])[], iterations = 120): Layout {
  if (n === 0) return { x: [], y: [] };
  if (n === 1) return { x: [0.5], y: [0.5] };
  const x = new Array<number>(n);
  const y = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    x[i] = 0.5 + 0.35 * Math.cos(a);
    y[i] = 0.5 + 0.35 * Math.sin(a);
  }
  const k = Math.sqrt(1 / n) * 0.9;
  let temp = 0.1;
  const cool = temp / (iterations + 1);
  const dx = new Array<number>(n);
  const dy = new Array<number>(n);
  for (let it = 0; it < iterations; it++) {
    dx.fill(0);
    dy.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ex = (x[i] as number) - (x[j] as number);
        let ey = (y[i] as number) - (y[j] as number);
        let d = Math.hypot(ex, ey);
        if (d < 1e-6) {
          ex = ((i * 7 + j * 13) % 11) / 1000 + 1e-3;
          ey = ((i * 5 + j * 3) % 7) / 1000 + 1e-3;
          d = Math.hypot(ex, ey);
        }
        const f = (k * k) / d;
        const fx = (ex / d) * f;
        const fy = (ey / d) * f;
        dx[i] = (dx[i] as number) + fx; dy[i] = (dy[i] as number) + fy;
        dx[j] = (dx[j] as number) - fx; dy[j] = (dy[j] as number) - fy;
      }
    }
    for (const [a, b] of edges) {
      if (a === b) continue;
      const ex = (x[a] as number) - (x[b] as number);
      const ey = (y[a] as number) - (y[b] as number);
      const d = Math.max(Math.hypot(ex, ey), 1e-6);
      const f = (d * d) / k;
      const fx = (ex / d) * f;
      const fy = (ey / d) * f;
      dx[a] = (dx[a] as number) - fx; dy[a] = (dy[a] as number) - fy;
      dx[b] = (dx[b] as number) + fx; dy[b] = (dy[b] as number) + fy;
    }
    for (let i = 0; i < n; i++) {
      // mild gravity keeps disconnected pieces on screen
      dx[i] = (dx[i] as number) - ((x[i] as number) - 0.5) * 0.5;
      dy[i] = (dy[i] as number) - ((y[i] as number) - 0.5) * 0.5;
      const d = Math.max(Math.hypot(dx[i] as number, dy[i] as number), 1e-9);
      const step = Math.min(d, temp);
      x[i] = (x[i] as number) + ((dx[i] as number) / d) * step;
      y[i] = (y[i] as number) + ((dy[i] as number) / d) * step;
    }
    temp -= cool;
  }
  const minX = Math.min(...x), maxX = Math.max(...x), minY = Math.min(...y), maxY = Math.max(...y);
  const sx = maxX - minX || 1;
  const sy = maxY - minY || 1;
  return {
    x: x.map((v) => 0.05 + (0.9 * (v - minX)) / sx),
    y: y.map((v) => 0.05 + (0.9 * (v - minY)) / sy),
  };
}
