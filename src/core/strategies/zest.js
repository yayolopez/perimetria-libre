/**
 * ZEST (Zippy Estimation by Sequential Testing), King-Smith et al. 1994.
 * Estimación bayesiana del umbral: se presenta la media de la distribución a
 * posteriori y se actualiza con cada respuesta. Parámetros por defecto
 * equivalentes a los de OPI (Turpin et al. 2012).
 */
import { clamp, probabilitySeen } from '../math.js';

export const ZEST_DEFAULTS = {
  domainMin: -5,
  domainMax: 45,
  fpr: 0.03,
  fnr: 0.03,
  slope: 1,
  stopSd: 1.5,
  maxPresentations: 10,
  // Prior bimodal: campo normal alrededor del valor esperado + componente de daño.
  normalWeight: 0.85,
  normalSd: 4,
  damagedMean: 0,
  damagedSd: 6,
  floor: 0.001,
};

const gauss = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2);

export class ZestStrategy {
  constructor({ startDb, minDb, maxDb, ...options }) {
    this.opts = { ...ZEST_DEFAULTS, ...options };
    this.minDb = minDb;
    this.maxDb = maxDb;
    this.history = [];
    this.finished = false;
    this.notSeenAtMin = 0;
    this.seenAtMax = 0;

    const { domainMin, domainMax, normalWeight, normalSd, damagedMean, damagedSd, floor } = this.opts;
    this.domain = [];
    for (let t = domainMin; t <= domainMax; t++) this.domain.push(t);
    this.pdf = this.domain.map(
      (t) =>
        normalWeight * gauss(t, startDb, normalSd) +
        (1 - normalWeight) * gauss(t, damagedMean, damagedSd) +
        floor,
    );
    this.normalize();
  }

  normalize() {
    const sum = this.pdf.reduce((a, b) => a + b, 0);
    for (let i = 0; i < this.pdf.length; i++) this.pdf[i] /= sum;
  }

  mean() {
    return this.domain.reduce((acc, t, i) => acc + t * this.pdf[i], 0);
  }

  sd() {
    const m = this.mean();
    return Math.sqrt(this.domain.reduce((acc, t, i) => acc + (t - m) ** 2 * this.pdf[i], 0));
  }

  nextStimulus() {
    if (this.finished) return null;
    return clamp(Math.round(this.mean()), this.minDb, this.maxDb);
  }

  update(db, seen) {
    this.history.push({ db, seen });
    for (let i = 0; i < this.domain.length; i++) {
      const p = probabilitySeen(db, this.domain[i], this.opts);
      this.pdf[i] *= seen ? p : 1 - p;
    }
    this.normalize();

    if (!seen && db <= this.minDb) this.notSeenAtMin++;
    if (seen && db >= this.maxDb) this.seenAtMax++;

    this.finished =
      this.sd() < this.opts.stopSd ||
      this.history.length >= this.opts.maxPresentations ||
      this.notSeenAtMin >= 2 ||
      this.seenAtMax >= 2;
  }

  result() {
    const estimate = this.mean();
    let flag = null;
    let threshold = Math.round(estimate * 10) / 10;
    if (this.notSeenAtMin >= 2 || estimate < this.minDb - 0.5) {
      flag = '<';
      threshold = this.minDb;
    } else if (this.seenAtMax >= 2 || estimate > this.maxDb + 0.5) {
      flag = '>=';
      threshold = this.maxDb;
    }
    return { threshold, flag, sd: this.sd(), presentations: this.history.length };
  }
}
