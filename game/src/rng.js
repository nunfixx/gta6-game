// Seeded RNG for Palmera Bay: every random choice in the city, traffic and
// pedestrians derives from one seed, so a ?shot=...&seed=N scene is the same
// every time it loads.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick one element of an array with the seeded rng.
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Integer in [min, max] inclusive.
export function intIn(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// Float in [min, max).
export function floatIn(rng, min, max) {
  return min + rng() * (max - min);
}

// Shuffle a copy of an array in place, seeded.
export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}
