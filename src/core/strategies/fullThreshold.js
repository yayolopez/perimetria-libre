/**
 * Umbral completo con escalera 4-2: pasos de 4 dB hasta la primera inversión,
 * luego de 2 dB hasta la segunda. El umbral es el último estímulo visto.
 */
import { clamp } from '../math.js';

export class FullThresholdStrategy {
  constructor({ startDb, minDb, maxDb, maxPresentations = 16 }) {
    this.minDb = minDb;
    this.maxDb = maxDb;
    this.maxPresentations = maxPresentations;
    this.current = clamp(Math.round(startDb), minDb, maxDb);
    this.step = 4;
    this.reversals = 0;
    this.lastResponse = null;
    this.lastSeenDb = null;
    this.notSeenAtMin = 0;
    this.flag = null;
    this.history = [];
    this.finished = false;
  }

  nextStimulus() {
    return this.finished ? null : this.current;
  }

  update(db, seen) {
    this.history.push({ db, seen });
    if (seen) this.lastSeenDb = db;

    if (this.lastResponse !== null && seen !== this.lastResponse) {
      this.reversals++;
      this.step = 2;
    }
    this.lastResponse = seen;

    if (seen && db >= this.maxDb) {
      this.flag = '>=';
      this.finished = true;
    } else if (!seen && db <= this.minDb) {
      this.notSeenAtMin++;
      if (this.notSeenAtMin >= 2) {
        this.flag = '<';
        this.finished = true;
      }
    } else if (this.reversals >= 2) {
      this.finished = true;
    }

    if (this.history.length >= this.maxPresentations) this.finished = true;
    if (!this.finished) {
      this.current = clamp(seen ? db + this.step : db - this.step, this.minDb, this.maxDb);
    }
  }

  result() {
    let { flag } = this;
    let threshold = this.lastSeenDb;
    if (threshold === null) {
      flag = '<';
      threshold = this.minDb;
    } else if (flag === '<') {
      // Se vio algo antes pero no al máximo brillo: se informa el último visto.
      flag = null;
    }
    return { threshold, flag, presentations: this.history.length };
  }
}
