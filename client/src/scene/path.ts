// A* path finding on the room tile grid (8 directions, no corner cutting).
export function findPath(w: number, d: number, blocked: Set<string>, from: [number, number], to: [number, number]): [number, number][] | null {
  const key = (x: number, z: number) => `${x},${z}`;
  const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < w && z < d;
  const free = (x: number, z: number) => inside(x, z) && !blocked.has(key(x, z));
  const [sx, sz] = from, [tx, tz] = to;
  if (!free(tx, tz)) return null;
  const open: { x: number; z: number; f: number; g: number }[] = [{ x: sx, z: sz, f: 0, g: 0 }];
  const came = new Map<string, string>();
  const gScore = new Map<string, number>([[key(sx, sz), 0]]);
  const h = (x: number, z: number) => Math.hypot(tx - x, tz - z);
  let guard = 0;
  while (open.length && guard++ < 4000) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!;
    if (cur.x === tx && cur.z === tz) {
      const out: [number, number][] = [[tx, tz]];
      let k = key(tx, tz);
      while (came.has(k)) { k = came.get(k)!; const [x, z] = k.split(',').map(Number); out.unshift([x, z]); }
      return out;
    }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const nx = cur.x + dx, nz = cur.z + dz;
      if (!free(nx, nz)) continue;
      if (dx && dz && (!free(cur.x + dx, cur.z) || !free(cur.x, cur.z + dz))) continue;
      const g = cur.g + (dx && dz ? 1.414 : 1);
      const k = key(nx, nz);
      if (g < (gScore.get(k) ?? Infinity)) {
        gScore.set(k, g);
        came.set(k, key(cur.x, cur.z));
        open.push({ x: nx, z: nz, g, f: g + h(nx, nz) });
      }
    }
  }
  return null;
}

/** nearest free tile to a target (used when the clicked tile is blocked) */
export function nearestFree(w: number, d: number, blocked: Set<string>, x: number, z: number): [number, number] {
  let best: [number, number] = [x, z], bd = Infinity;
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) {
    if (blocked.has(`${i},${j}`)) continue;
    const dd = Math.hypot(i - x, j - z);
    if (dd < bd) { bd = dd; best = [i, j]; }
  }
  return best;
}
