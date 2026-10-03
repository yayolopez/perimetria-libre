/**
 * Visión de colores por contraste de conos (en el espíritu de las pruebas de
 * contraste de conos y del Cambridge Colour Test, sin copiar láminas).
 *
 * Una C de Landolt formada por puntos se distingue del fondo SOLO por un
 * cambio de color que estimula un tipo de cono (L, M o S); el brillo de cada
 * punto varía al azar para que el contraste de luminancia no sirva de pista.
 * Se mide el umbral de contraste de cono para cada eje:
 *   L → protan,  M → deutan,  S → tritan.
 *
 * Los colores suponen primarios sRGB: sin calibrar el color del equipo los
 * valores son orientativos.
 */
import { BayesStaircase } from '../adaptive.js';
import { createRng } from '../math.js';
import { DIRECTIONS } from './acuity.js';

export const AXES = {
  protan: { cone: 0, label: 'Protan (conos L, rojo)' },
  deutan: { cone: 1, label: 'Deutan (conos M, verde)' },
  tritan: { cone: 2, label: 'Tritan (conos S, azul)' },
};

const SRGB_TO_XYZ = [
  [0.4124, 0.3576, 0.1805],
  [0.2126, 0.7152, 0.0722],
  [0.0193, 0.1192, 0.9505],
];
const XYZ_TO_LMS = [
  [0.4002, 0.7076, -0.0808],
  [-0.2263, 1.1653, 0.0457],
  [0, 0, 0.9182],
];

const mul = (m, v) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
const matmul = (a, b) => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
function invert3(m) {
  const [a, b, c] = m[0];
  const [d, e, f] = m[1];
  const [g, h, i] = m[2];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

const RGB_TO_LMS = matmul(XYZ_TO_LMS, SRGB_TO_XYZ);
const LMS_TO_RGB = invert3(RGB_TO_LMS);

export const DEFAULT_BACKGROUND = [0.2, 0.2, 0.2]; // sRGB lineal

/** Color (sRGB lineal) que cambia solo el cono del eje en `contrast` respecto del fondo. */
export function coneIsolating(bg, axis, contrast) {
  const lms = mul(RGB_TO_LMS, bg);
  lms[AXES[axis].cone] *= 1 + contrast;
  return mul(LMS_TO_RGB, lms);
}

export const linearToSrgb = (v) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;

/** Mayor contraste de cono que entra en la gama de la pantalla, contando la variación de brillo. */
export function maxConeContrast(bg, axis, brightnessJitter = 0.25) {
  let lo = 0;
  let hi = 4;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    const rgb = coneIsolating(bg, axis, mid).map((v) => v * (1 + brightnessJitter));
    const low = coneIsolating(bg, axis, mid).map((v) => v * (1 - brightnessJitter));
    const ok = rgb.every((v) => v <= 1) && low.every((v) => v >= 0);
    if (ok) lo = mid;
    else hi = mid;
  }
  return lo;
}

export class ColorTest {
  constructor({ rng = createRng(Date.now()), background = DEFAULT_BACKGROUND } = {}) {
    this.rng = rng;
    this.background = background;
    this.stairs = new Map();
    for (const axis of Object.keys(AXES)) {
      const top = Math.log10(maxConeContrast(background, axis));
      this.stairs.set(
        axis,
        new BayesStaircase({
          min: -3,
          max: top + 0.3,
          guess: 0.25,
          slope: 0.07,
          priorMean: axis === 'tritan' ? -1.2 : -1.8,
          priorSd: 0.6,
          stimulusMin: -3,
          stimulusMax: top,
          stopSd: 0.08,
          minTrials: 10,
          maxTrials: 28,
          warmup: 1,
        }),
      );
      this.stairs.get(axis).top = top;
    }
  }

  get finished() {
    return [...this.stairs.values()].every((s) => s.finished);
  }

  progress() {
    const s = [...this.stairs.values()];
    return s.reduce((a, st) => a + Math.min(1, st.history.length / 16), 0) / s.length;
  }

  nextTrial() {
    const active = [...this.stairs.keys()].filter((a) => !this.stairs.get(a).finished);
    const axis = active[Math.floor(this.rng() * active.length)];
    const logContrast = this.stairs.get(axis).next();
    return {
      axis,
      logContrast,
      contrast: 10 ** logContrast,
      gap: DIRECTIONS[Math.floor(this.rng() * 4)],
      seed: Math.floor(this.rng() * 1e9),
    };
  }

  respond(trial, dir) {
    const correct = dir === trial.gap;
    this.stairs.get(trial.axis).update(trial.logContrast, correct);
    return correct;
  }

  result() {
    const axes = {};
    for (const [axis, st] of this.stairs) {
      const r = st.result();
      axes[axis] = {
        contrastPct: Math.round(10 ** r.threshold * 1000) / 10,
        logContrast: r.threshold,
        sd: r.sd,
        trials: r.trials,
        exceedsMax: r.threshold > st.top - st.slope,
      };
    }
    return { axes, interpretation: interpretColor(axes) };
  }
}

/**
 * Lectura orientativa comparando ejes entre sí (no hay base normativa aún):
 * un eje rojo-verde 3 veces peor que el otro sugiere defecto de ese tipo.
 */
export function interpretColor(axes) {
  const L = axes.protan.logContrast;
  const M = axes.deutan.logContrast;
  if (axes.protan.exceedsMax && axes.deutan.exceedsMax) return 'Defecto rojo-verde marcado (no se distingue protan de deutan).';
  if (L - M > 0.45) return 'Sugiere defecto protan (rojo).';
  if (M - L > 0.45) return 'Sugiere defecto deutan (verde).';
  if (axes.tritan.exceedsMax) return 'Sugiere defecto tritan (azul-amarillo).';
  return 'Sin diferencias marcadas entre ejes.';
}
