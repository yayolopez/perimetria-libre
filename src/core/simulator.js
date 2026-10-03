/**
 * Observador simulado: sirve para pruebas automáticas, para validar estrategias
 * y para el modo demostración. Nunca debe mezclarse con datos de pacientes.
 */
import { probabilitySeen, createRng } from './math.js';
import { blindSpotLocation, eccentricity } from './patterns.js';
import { PerimetrySession } from './procedure.js';
import { summarize } from './results.js';
import { buildNormative } from './normative.js';

export class SimulatedObserver {
  constructor({
    thresholdAt = () => 30,
    fpr = 0.03,
    fnr = 0.03,
    slope = 1,
    fixationLossRate = 0,
    rng = createRng(1),
  } = {}) {
    Object.assign(this, { thresholdAt, fpr, fnr, slope, fixationLossRate, rng });
  }

  respond(trial) {
    const psi = { fpr: this.fpr, fnr: this.fnr, slope: this.slope };
    switch (trial.kind) {
      case 'falsePositive':
        return this.rng() < this.fpr;
      case 'fixation': {
        // Si fija bien, el estímulo cae en la mancha ciega y no lo ve.
        const fixating = this.rng() >= this.fixationLossRate;
        if (fixating) return this.rng() < this.fpr;
        return this.rng() < probabilitySeen(trial.db, 28, psi);
      }
      default:
        return this.rng() < probabilitySeen(trial.db, this.thresholdAt(trial), psi);
    }
  }
}

/** Corre una sesión completa sin tiempos reales. */
export function runSimulation(session, observer) {
  let trial;
  while ((trial = session.nextTrial())) {
    const seen = observer.respond(trial);
    session.recordResponse(trial, {
      seen,
      responseTimeMs: seen ? 350 + 200 * observer.rng() : null,
      realizedDb: trial.db,
    });
  }
  return session;
}

// Modelo del campo normal simulado: colina de visión que cae con la edad.
const SIM_AGE_SLOPE = -0.07; // dB por año

function gaussian(rng) {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Campo normal simulado (con mancha ciega) para la edad dada. */
export function normalField(eye = 'OD', age = 50) {
  const bs = blindSpotLocation(eye);
  return (p) => {
    if (Math.hypot(p.x - bs.x, p.y - bs.y) < 4) return -5;
    return 31 - 0.2 * eccentricity(p) + SIM_AGE_SLOPE * (age - 50);
  };
}

/** Campo de demostración: normal + defecto arciforme superior y escalón nasal. */
export function glaucomaDemoField(eye = 'OD', age = 50) {
  const normal = normalField(eye, age);
  const nasal = eye === 'OI' ? 1 : -1;
  return (p) => {
    let t = normal(p);
    const ecc = eccentricity(p);
    if (p.y > 0 && ecc > 8 && ecc < 24 && p.x * nasal > -6) t -= 16;
    if (p.y > 0 && p.x * nasal > 20) t -= 10;
    return t;
  };
}

/**
 * Base normativa SINTÉTICA, construida simulando sujetos sanos de 20 a 80 años.
 * Solo sirve para ver cómo funciona el informe en modo simulación.
 */
export function syntheticNormative({ patternId, range, stimulusSizeDeg = 0.431, subjects = 120, seed = 99 }) {
  const rng = createRng(seed);
  const results = [];
  for (let i = 0; i < subjects; i++) {
    const age = 20 + Math.round(60 * rng());
    const eye = rng() < 0.5 ? 'OD' : 'OI';
    const field = normalField(eye, age);
    const shift = gaussian(rng); // variación individual global
    const local = new Map();
    const thresholdAt = (p) => {
      const k = `${p.x},${p.y}`;
      if (!local.has(k)) local.set(k, gaussian(rng) * (0.8 + 0.04 * eccentricity(p)));
      return field(p) + shift + local.get(k);
    };
    const session = new PerimetrySession({
      patternId,
      eye,
      range,
      seed: seed + i,
      catchTrials: { fixation: 0, falsePositive: 0, falseNegative: 0 },
    });
    runSimulation(session, new SimulatedObserver({ thresholdAt, rng }));
    results.push(summarize(session, { age, mode: 'simulation', stimulusSizeDeg }));
  }
  return {
    ...buildNormative({ id: `sintetica-${patternId}`, name: 'SINTÉTICA (solo demostración)', results }),
    synthetic: true,
  };
}
