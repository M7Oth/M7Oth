// Small deterministic PRNG (mulberry32) so the simulation is reproducible on client and server.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  next(): number;
  int(min: number, max: number): number; // inclusive
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
  range(min: number, max: number): number;
  shuffle<T>(arr: T[]): T[];
}

export function makeRng(seed: number): Rng {
  const f = mulberry32(seed);
  const r: Rng = {
    next: f,
    int: (min, max) => Math.floor(f() * (max - min + 1)) + min,
    pick: (arr) => arr[Math.floor(f() * arr.length)],
    chance: (p) => f() < p,
    range: (min, max) => min + f() * (max - min),
    shuffle: (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(f() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
  return r;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Use state's rng and advance it. */
export function stateRng(state: { rng: number }): Rng {
  const seed = state.rng;
  state.rng = (Math.imul(seed ^ 0x9e3779b9, 2654435761) + 12345) >>> 0;
  return makeRng(seed);
}
