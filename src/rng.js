/* Seeded RNG utilities. World generation uses a fixed seed so every
   player explores the same continent; gameplay rolls use a
   time-seeded stream. */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 2D hash -> [0,1), deterministic per (x, y, seed). */
export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* Smooth value noise built on hash2. */
export function valueNoise(x, y, scale, seed) {
  const xs = x / scale, ys = y / scale;
  const x0 = Math.floor(xs), y0 = Math.floor(ys);
  const fx = xs - x0, fy = ys - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const v00 = hash2(x0, y0, seed), v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed), v11 = hash2(x0 + 1, y0 + 1, seed);
  const a = v00 + (v10 - v00) * sx;
  const b = v01 + (v11 - v01) * sx;
  return a + (b - a) * sy;
}

/* Fractal noise, 3 octaves. */
export function fbm(x, y, scale, seed) {
  return (
    valueNoise(x, y, scale, seed) * 0.55 +
    valueNoise(x, y, scale / 2, seed + 7) * 0.30 +
    valueNoise(x, y, scale / 4, seed + 13) * 0.15
  );
}

/* Gameplay RNG (non-deterministic seed). */
export const roll = mulberry32((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);

/* Weighted pick from array of {weight} objects; rng defaults to gameplay roll. */
export function weightedPick(arr, rng = roll) {
  let total = 0;
  for (const a of arr) total += a.weight;
  let r = rng() * total;
  for (const a of arr) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return arr[arr.length - 1];
}

export function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function pick(arr, rng = roll) {
  return arr[Math.floor(rng() * arr.length)];
}
