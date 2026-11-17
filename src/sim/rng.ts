// Noita's random number generator (the engine's C++ "NollaPrng" behind SetRandomSeed / Random / ProceduralRandom),
// ported from TwoAbove/noita-tools (MIT, © 2022 Seva Maltsev: src/services/SeedInfo/wasm/core/nolla_prng.zig and
// wasm/entries/rng.zig), which reverse-engineered it from the game. Every seeded thing in a run comes from here:
// SetRandomSeed(x, y) mixes the world seed with a position, then Random() steps a Park–Miller generator.

const LCG_MODULUS = 0x7fffffff;
const LCG_MULTIPLIER = 0x41a7;
const LCG_DIVISOR = 0x1f31d;
const U32_HALF = 0x80000000;
const MAGIC = 252645135;
const DIDDLE = [0, 4, 6, 25, 12, 39, 52, 9, 21, 64, 78, 92, 104, 118, 18, 32, 44];

const u32 = (v: number) => v >>> 0;

/** A double truncated to int64, its low 32 bits (0 when it isn't finite or doesn't fit). */
function seedHelper(value: number) {
  if (!Number.isFinite(value) || value < -9.223372036854776e18 || value >= 9.223372036854776e18) return 0;
  return Number(BigInt.asUintN(32, BigInt(Math.trunc(value))));
}

function seedHelper2(a: number, b: number, ws: number) {
  let v2 = u32(u32(u32(a - b) - ws) ^ (ws >>> 13));
  let v1 = u32(u32(u32(b - v2) - ws) ^ u32(v2 << 8));
  let v3 = u32(u32(u32(ws - v2) - v1) ^ (v1 >>> 13));
  v2 = u32(u32(u32(v2 - v1) - v3) ^ (v3 >>> 12));
  v1 = u32(u32(u32(v1 - v2) - v3) ^ u32(v2 << 16));
  v3 = u32(u32(u32(v3 - v2) - v1) ^ (v1 >>> 5));
  v2 = u32(u32(u32(v2 - v1) - v3) ^ (v3 >>> 3));
  v1 = u32(u32(u32(v1 - v2) - v3) ^ u32(v2 << 10));
  return u32(u32(u32(v3 - v2) - v1) ^ (v1 >>> 15));
}

/** Round half to even, in single precision (the engine rounds float arguments this way). */
export function roundHalfEven(value: number) {
  const v = Math.fround(value);
  const f = Math.floor(v);
  const d = v - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

export class NollaPrng {
  seed = 0;

  /** Next value in [0, 1). */
  next() {
    const s = this.seed | 0;
    let n = (Math.imul(LCG_MULTIPLIER, s) - Math.imul(LCG_MODULUS, Math.trunc(s / LCG_DIVISOR))) | 0;
    if (n <= 0) n = (n + LCG_MODULUS) | 0;
    this.seed = n;
    return n / LCG_MODULUS;
  }

  /** Mix the world seed with a position (SetRandomSeed). */
  setRandomSeed(ws: number, x: number, y: number) {
    ws = u32(ws);
    const a = u32(ws ^ 0x93262e6f);
    const b = a & 0xfff;
    const c = (a >>> 12) & 0xfff;
    const xa = x + b;
    let ya = y + c;
    let material = xa * 134217727;
    const e = seedHelper(material);
    if (Math.abs(ya) >= 102400 || Math.abs(xa) <= 1) {
      material = ya * 134217727;
    } else {
      let yw = ya * 3483.328;
      yw += e;
      ya *= yw;
      material = ya;
    }
    const f = seedHelper(material);
    const g = seedHelper2(e, f, ws);
    let t = g;
    t = u32(t + Number(g < U32_HALF) + Number(g === 0));
    t = u32(t - Math.floor(g / MAGIC));
    t = u32(t + Number(g % MAGIC < DIDDLE[Math.floor(g / MAGIC)]! && (g < 0xc3c3c3c3 + 4 || g >= 0xc3c3c3c3 + 62)));
    t = u32(t + Number(g > U32_HALF)) >>> 1;
    t = u32(t + Number(g === 0xffffffff));
    this.seed = t;
    this.next();
    for (let h = ws & 3; h !== 0; h--) this.next();
  }

  /** An integer from min to max inclusive. */
  random(min: number, max: number) {
    return min + Math.trunc((max + 1 - min) * this.next());
  }
}

/** One value from a fresh generator seeded at (x, y) for a seed (the engine's spell picks use this). */
export function seededRandom(seed: number, x: number, y: number) {
  const r = new NollaPrng();
  r.setRandomSeed(seed >>> 0, Math.fround(x), Math.fround(y));
  return r.next();
}

/** The engine's mean-weighted distribution (RandomDistribution). */
function distribution(rng: NollaPrng, mean: number, sharpness: number, baseline = 0.005) {
  const meanOffset = Math.fround(0.5 - mean);
  for (let i = 0; i < 100; i++) {
    const r1 = Math.fround(rng.next());
    const r2 = Math.fround(rng.next());
    const div = Math.fround(Math.abs(r1 - mean));
    if (r2 < Math.fround((1 - div) * baseline)) return r1;
    if (div < 0.5) {
      const wave = Math.fround(Math.sin(Math.fround(Math.fround(meanOffset + r1) * Math.fround(3.1415))));
      if (Math.fround(Math.pow(wave, sharpness)) > r2) return r1;
    }
  }
  return Math.fround(rng.next());
}

/** The functions the game's Lua calls, over one world seed. */
export class NoitaRandom {
  private rng = new NollaPrng();
  /**
   * ProceduralRandom* seed a generator of their own: they don't disturb the SetRandomSeed / Random sequence (what
   * noita-tools' fungal shift port relies on to match the game, e.g. the "flask of gold" result).
   */
  private procedural = new NollaPrng();
  constructor(public worldSeed = 0) {}

  setWorldSeed(seed: number) {
    this.worldSeed = u32(seed);
  }

  SetRandomSeed(x: number, y: number) {
    this.rng.setRandomSeed(this.worldSeed, x, y);
  }

  /** Random() → float in [0, 1); Random(max) → 0..max; Random(a, b) → a..b (non-integers rounded half to even). */
  Random(a?: number, b?: number) {
    if (a === undefined) return Math.fround(this.rng.next());
    if (b === undefined) return this.rng.random(0, roundHalfEven(a));
    return Number.isInteger(a) && Number.isInteger(b) ? this.rng.random(a, b) : this.rng.random(roundHalfEven(a), roundHalfEven(b));
  }

  /** Randomf() → [0, 1); Randomf(a) → [0, a); Randomf(a, b) → [a, b). */
  Randomf(a?: number, b?: number) {
    const v = this.rng.next();
    if (a === undefined) return Math.fround(v);
    if (b === undefined) return Math.fround(a * v);
    return Math.fround(a + (b - a) * v);
  }

  /** ProceduralRandom(x, y) → [0, 1); (x, y, a) → int 0..a; (x, y, a, b) → number a..b (lua_api_documentation.txt). */
  ProceduralRandom(x: number, y: number, a?: number, b?: number) {
    this.procedural.setRandomSeed(this.worldSeed, x, y);
    if (a === undefined) return Math.fround(this.procedural.next());
    if (b === undefined) return this.procedural.random(0, roundHalfEven(a));
    return Math.fround(a + (b - a) * this.procedural.next());
  }

  ProceduralRandomf(x: number, y: number, a?: number, b?: number) {
    this.procedural.setRandomSeed(this.worldSeed, x, y);
    const v = this.procedural.next();
    if (a === undefined) return Math.fround(v);
    if (b === undefined) return Math.fround(a * v);
    return Math.fround(a + (b - a) * v);
  }

  /** (x, y) → 0 or 1; (x, y, a) → 0..a; (x, y, a, b) → a..b. */
  ProceduralRandomi(x: number, y: number, a?: number, b?: number) {
    this.procedural.setRandomSeed(this.worldSeed, x, y);
    if (a === undefined) return this.procedural.random(0, 1);
    if (b === undefined) return this.procedural.random(0, roundHalfEven(a));
    return this.procedural.random(roundHalfEven(a), roundHalfEven(b));
  }

  RandomDistribution(min: number, max: number, mean: number, sharpness = 1, baseline = 0.005) {
    if (sharpness === 0) return this.rng.random(min, max);
    const m = Math.fround((mean - min) / (max - min));
    return min + Math.round(Math.fround((max - min) * distribution(this.rng, m, sharpness, baseline)));
  }

  RandomDistributionf(min: number, max: number, mean: number, sharpness = 1, baseline = 0.005) {
    if (sharpness === 0) return Math.fround(Math.fround(this.rng.next()) * (max - min) + min);
    const m = Math.fround((mean - min) / (max - min));
    return Math.fround(min + (max - min) * distribution(this.rng, m, sharpness, baseline));
  }

  /** The functions as Lua globals (the fake engine calls them in place of its own stand-ins). */
  luaGlobals(): Record<string, (...a: (number | undefined)[]) => number | void> {
    const n = (v: number | undefined | null) => (v === null ? undefined : v);
    return {
      __rng_SetRandomSeed: (x, y) => this.SetRandomSeed(x ?? 0, y ?? 0),
      __rng_Random: (a, b) => this.Random(n(a), n(b)),
      __rng_Randomf: (a, b) => this.Randomf(n(a), n(b)),
      __rng_ProceduralRandom: (x, y, a, b) => this.ProceduralRandom(x ?? 0, y ?? 0, n(a), n(b)),
      __rng_ProceduralRandomf: (x, y, a, b) => this.ProceduralRandomf(x ?? 0, y ?? 0, n(a), n(b)),
      __rng_ProceduralRandomi: (x, y, a, b) => this.ProceduralRandomi(x ?? 0, y ?? 0, n(a), n(b)),
      __rng_RandomDistribution: (min, max, mean, s, base) => this.RandomDistribution(min!, max!, mean!, s ?? 1, base ?? 0.005),
      __rng_RandomDistributionf: (min, max, mean, s, base) => this.RandomDistributionf(min!, max!, mean!, s ?? 1, base ?? 0.005),
      __rng_SetWorldSeed: (s) => this.setWorldSeed(s ?? 0),
      __rng_SeededRandom: (seed, x, y) => seededRandom(seed ?? 0, x ?? 0, y ?? 0),
      __rng_RoundHalfEven: (v) => roundHalfEven(v ?? 0),
      __rng_GetWorldSeed: () => this.worldSeed,
    };
  }
}
