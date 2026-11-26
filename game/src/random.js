// Cakrawala Courier — a small seeded random source and value noise.
// The terrain, the town, the trees and the later routes all draw from one
// seed, so the world is identical on every load: a screenshot, a replay and
// a player's flight all see the same islands.

// mulberry32: a tiny deterministic PRNG. Returns a function that yields a
// number in [0, 1) on every call.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D value noise over a seeded grid. smoothstep interpolation between grid
// corners gives rolling hills instead of a blocky grid.
export function makeNoise2D(seed) {
  const rand = mulberry32(seed);
  const size = 256;
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();

  function hash(ix, iz) {
    const x = ((ix % size) + size) % size;
    const z = ((iz % size) + size) % size;
    return grid[z * size + x];
  }

  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  function noise(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = smooth(x - ix);
    const fz = smooth(z - iz);
    const a = hash(ix, iz);
    const b = hash(ix + 1, iz);
    const c = hash(ix, iz + 1);
    const d = hash(ix + 1, iz + 1);
    const ab = a + (b - a) * fx;
    const cd = c + (d - c) * fx;
    return ab + (cd - ab) * fz; // in [0, 1)
  }

  // Three octaves of noise, each half the strength of the last.
  return function fbm(x, z) {
    let value = 0;
    let amp = 0.5;
    let freq = 1;
    for (let o = 0; o < 3; o++) {
      value += amp * noise(x * freq, z * freq);
      amp *= 0.5;
      freq *= 2.03;
    }
    return value; // roughly in [0, 1)
  };
}
