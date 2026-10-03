/**
 * Estereoagudeza con estereogramas de puntos aleatorios: un disco con
 * disparidad cruzada (se ve delante) aparece en una de 4 posiciones. Sin
 * visión binocular el disco es invisible, así que no hay pistas monoculares.
 *
 * Límite del equipo: con suavizado de bordes se pueden desplazar los puntos
 * fracciones de píxel; se supone 1/4 de píxel como mínimo útil.
 */
import { BayesStaircase } from '../adaptive.js';
import { createRng } from '../math.js';
import { DIRECTIONS } from './acuity.js';

export const SUBPIXEL = 0.25;
export const minLogArcsec = (pxPerDeg) => Math.log10((3600 / pxPerDeg) * SUBPIXEL);

export class StereoTest {
  constructor({ pxPerDeg, rng = createRng(Date.now()) }) {
    this.rng = rng;
    this.limit = minLogArcsec(pxPerDeg);
    this.stair = new BayesStaircase({
      min: 0.7,
      max: 3.5,
      guess: 0.25,
      slope: 0.08,
      priorMean: 2.0,
      priorSd: 0.6,
      stimulusMin: this.limit,
      stimulusMax: 3.3,
      stopSd: 0.07,
      minTrials: 10,
      maxTrials: 30,
      warmup: 2,
    });
  }

  get finished() {
    return this.stair.finished;
  }

  progress() {
    return Math.min(1, this.stair.history.length / 18);
  }

  nextTrial() {
    const logArcsec = this.stair.next();
    return {
      logArcsec,
      arcsec: 10 ** logArcsec,
      location: DIRECTIONS[Math.floor(this.rng() * 4)],
      seed: Math.floor(this.rng() * 1e9),
    };
  }

  respond(trial, dir) {
    const correct = dir === trial.location;
    this.stair.update(trial.logArcsec, correct);
    return correct;
  }

  result() {
    const r = this.stair.result();
    return {
      arcsec: Math.round(10 ** r.threshold),
      logArcsec: r.threshold,
      sd: r.sd,
      trials: r.trials,
      atLimit: r.atLimit,
      limitArcsec: Math.round(10 ** this.limit),
      noStereo: r.threshold > 3.2, // no detecta ni la disparidad máxima (~2000")
    };
  }
}
