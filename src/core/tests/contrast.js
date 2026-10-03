/**
 * Sensibilidad al contraste (función de sensibilidad al contraste, CSF).
 * Parches de Gabor verticales a la izquierda o a la derecha de la fijación
 * (elección forzada de 2 alternativas), una escalera bayesiana por frecuencia,
 * intercaladas al azar. Resultado en log CS = −log10(contraste de Michelson).
 */
import { BayesStaircase } from '../adaptive.js';
import { createRng } from '../math.js';

export const CSF_FREQUENCIES = [1.5, 3, 6, 12, 18];
export const GABOR_SIGMA_DEG = 1.2;
export const GABOR_OFFSET_DEG = 4;

/** Frecuencias representables: al menos 4 píxeles por ciclo. */
export const usableFrequencies = (pxPerDeg) => CSF_FREQUENCIES.filter((f) => f <= pxPerDeg / 4);

export class ContrastSensitivityTest {
  // Con dithering, 8 bits permiten contrastes de ~0.2 % (log CS ≈ 2.7).
  constructor({ pxPerDeg, minLogContrast = -2.7, rng = createRng(Date.now()) }) {
    this.rng = rng;
    this.frequencies = usableFrequencies(pxPerDeg);
    if (this.frequencies.length === 0) throw new Error('La resolución del equipo es demasiado baja para esta prueba');
    this.stairs = new Map(
      this.frequencies.map((f) => [
        f,
        new BayesStaircase({
          min: -3.2,
          max: 0,
          guess: 0.5,
          slope: 0.08,
          priorMean: -1.6,
          priorSd: 0.7,
          stimulusMin: minLogContrast,
          stimulusMax: 0,
          stopSd: 0.08,
          minTrials: 10,
          maxTrials: 30,
          warmup: 1,
        }),
      ]),
    );
  }

  get finished() {
    return [...this.stairs.values()].every((s) => s.finished);
  }

  progress() {
    const s = [...this.stairs.values()];
    return s.reduce((a, st) => a + Math.min(1, st.history.length / 18), 0) / s.length;
  }

  nextTrial() {
    const active = this.frequencies.filter((f) => !this.stairs.get(f).finished);
    const cpd = active[Math.floor(this.rng() * active.length)];
    const logContrast = this.stairs.get(cpd).next();
    return { cpd, logContrast, contrast: 10 ** logContrast, side: this.rng() < 0.5 ? 'left' : 'right' };
  }

  respond(trial, side) {
    const correct = side === trial.side;
    this.stairs.get(trial.cpd).update(trial.logContrast, correct);
    return correct;
  }

  result() {
    return {
      frequencies: this.frequencies.map((cpd) => {
        const r = this.stairs.get(cpd).result();
        return {
          cpd,
          logCS: Math.round(-r.threshold * 100) / 100,
          sd: r.sd,
          trials: r.trials,
          atLimit: r.atLimit,
          notSeen: r.threshold > -0.1, // no vio ni con contraste máximo
        };
      }),
    };
  }
}
