/**
 * Agudeza visual con E de Snellen ("tumbling E") de 4 orientaciones y escalera
 * bayesiana en logMAR. La E mide 5 × MAR de alto (estándar ISO 8596).
 *
 * Límite del equipo: el trazo de la letra (1 MAR) no puede ser menor que
 * 1 píxel. En un visor de ~20 px/° eso equivale a ~3 minutos de arco
 * (logMAR ≈ 0.5, 20/63): un visor no mide 20/20.
 */
import { BayesStaircase } from '../adaptive.js';
import { createRng } from '../math.js';

export const DIRECTIONS = ['up', 'right', 'down', 'left'];

export const minLogMAR = (pxPerDeg) => Math.log10(60 / pxPerDeg);
export const logMARtoDecimal = (l) => 10 ** -l;
export const logMARtoSnellen = (l, base = 20) => `${base}/${Math.round(base * 10 ** l)}`;

export class AcuityTest {
  constructor({ pxPerDeg, rng = createRng(Date.now()) }) {
    this.rng = rng;
    this.limit = Math.max(-0.3, minLogMAR(pxPerDeg));
    this.stair = new BayesStaircase({
      min: -0.4,
      max: 1.4,
      guess: 0.25,
      slope: 0.04,
      priorMean: 0.3,
      priorSd: 0.5,
      stimulusMin: this.limit,
      stimulusMax: 1.3,
      stopSd: 0.04,
      minTrials: 12,
      maxTrials: 35,
    });
  }

  get finished() {
    return this.stair.finished;
  }

  progress() {
    return Math.min(1, this.stair.history.length / 20);
  }

  nextTrial() {
    const logMAR = Math.round(this.stair.next() * 1000) / 1000;
    const marArcmin = 10 ** logMAR;
    return { logMAR, marArcmin, sizeDeg: (5 * marArcmin) / 60, dir: DIRECTIONS[Math.floor(this.rng() * 4)] };
  }

  respond(trial, dir) {
    const correct = dir === trial.dir;
    this.stair.update(trial.logMAR, correct);
    return correct;
  }

  result() {
    const r = this.stair.result();
    const logMAR = Math.round(r.threshold * 100) / 100;
    return {
      logMAR,
      sd: r.sd,
      trials: r.trials,
      atLimit: r.atLimit,
      limitLogMAR: this.limit,
      snellen20: logMARtoSnellen(logMAR, 20),
      snellen6: logMARtoSnellen(logMAR, 6),
      decimal: Math.round(logMARtoDecimal(logMAR) * 100) / 100,
    };
  }
}
