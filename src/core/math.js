/** Utilidades numéricas compartidas. */

// Abramowitz & Stegun 7.1.26 (error < 1.5e-7).
export function erf(x) {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-a * a);
  return s * y;
}

export const normalCdf = (x, mean = 0, sd = 1) => 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2)));

export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/**
 * Probabilidad de ver un estímulo de `db` cuando el umbral es `threshold`.
 * Más dB = más tenue, por eso la curva decrece con el estímulo.
 */
export function probabilitySeen(db, threshold, { fpr = 0.03, fnr = 0.03, slope = 1 } = {}) {
  return fpr + (1 - fpr - fnr) * (1 - normalCdf(db, threshold, slope));
}

/** Generador pseudoaleatorio reproducible (mulberry32). */
export function createRng(seed = Date.now()) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
