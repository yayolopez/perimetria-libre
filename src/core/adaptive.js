/**
 * Escalera bayesiana para tareas de elección forzada (nAFC), estilo QUEST
 * (Watson & Pelli, 1983) con colocación en la media de la distribución.
 *
 * El estímulo y el umbral se expresan en la misma escala logarítmica, en la
 * que un valor MAYOR es MÁS FÁCIL (letra más grande, más contraste, más
 * disparidad). P(correcto | x, t) = guess + (1 − guess − lapse) · F((x − t) / slope),
 * con F logística. El umbral es el punto medio de la curva (≈ 62.5 % en 4AFC).
 */
import { clamp } from './math.js';

const logistic = (z) => 1 / (1 + Math.exp(-z));

export class BayesStaircase {
  constructor({
    min,
    max,
    step = 0.01,
    guess,
    lapse = 0.03,
    slope = 0.05,
    priorMean = (min + max) / 2,
    priorSd = (max - min) / 3,
    stimulusMin = min, // límite del equipo: no se puede mostrar algo más difícil
    stimulusMax = max,
    stopSd = 0.05,
    minTrials = 10,
    maxTrials = 40,
    warmup = 0, // primeros ensayos con el estímulo más fácil, para que el paciente entienda la tarea
  }) {
    Object.assign(this, { guess, lapse, slope, stimulusMin, stimulusMax, stopSd, minTrials, maxTrials, warmup });
    this.domain = [];
    for (let t = min; t <= max + 1e-9; t += step) this.domain.push(t);
    this.pdf = this.domain.map((t) => Math.exp(-0.5 * ((t - priorMean) / priorSd) ** 2) + 1e-6);
    this.normalize();
    this.history = [];
  }

  normalize() {
    const s = this.pdf.reduce((a, b) => a + b, 0);
    for (let i = 0; i < this.pdf.length; i++) this.pdf[i] /= s;
  }

  pCorrect(x, t) {
    return this.guess + (1 - this.guess - this.lapse) * logistic((x - t) / this.slope);
  }

  mean() {
    return this.domain.reduce((a, t, i) => a + t * this.pdf[i], 0);
  }

  sd() {
    const m = this.mean();
    return Math.sqrt(this.domain.reduce((a, t, i) => a + (t - m) ** 2 * this.pdf[i], 0));
  }

  get finished() {
    const n = this.history.length;
    return n >= this.maxTrials || (n >= this.minTrials && this.sd() < this.stopSd);
  }

  next() {
    if (this.history.length < this.warmup) return this.stimulusMax;
    return clamp(this.mean(), this.stimulusMin, this.stimulusMax);
  }

  update(x, correct) {
    this.history.push({ x, correct });
    for (let i = 0; i < this.domain.length; i++) {
      const p = this.pCorrect(x, this.domain[i]);
      this.pdf[i] *= correct ? p : 1 - p;
    }
    this.normalize();
  }

  /** Umbral estimado; `atLimit` indica que el sujeto supera el límite del equipo. */
  result() {
    const threshold = this.mean();
    return {
      threshold,
      sd: this.sd(),
      trials: this.history.length,
      correct: this.history.filter((h) => h.correct).length,
      atLimit: threshold < this.stimulusMin + this.slope,
    };
  }
}
