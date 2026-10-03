/**
 * Tamizaje supraumbral relacionado con el umbral esperado: se presenta un
 * estímulo 6 dB más brillante que lo esperado para la edad. Si no se ve dos
 * veces, se prueba al máximo brillo para distinguir defecto relativo de absoluto.
 */
import { clamp } from '../math.js';

export const SUPRA_OFFSET_DB = 6;

export class SupraThresholdStrategy {
  constructor({ startDb, minDb, maxDb, offsetDb = SUPRA_OFFSET_DB }) {
    this.minDb = minDb;
    this.level = clamp(Math.round(startDb - offsetDb), minDb, maxDb);
    this.misses = 0;
    this.category = null; // 'normal' | 'relative' | 'absolute'
    this.history = [];
    this.finished = false;
  }

  nextStimulus() {
    if (this.finished) return null;
    return this.misses >= 2 ? this.minDb : this.level;
  }

  update(db, seen) {
    this.history.push({ db, seen });
    if (this.misses >= 2) {
      this.category = seen ? 'relative' : 'absolute';
      this.finished = true;
    } else if (seen) {
      this.category = 'normal';
      this.finished = true;
    } else {
      this.misses++;
      // Si el nivel de tamizaje ya es el máximo brillo, no hay paso intermedio.
      if (this.misses >= 2 && this.level <= this.minDb) {
        this.category = 'absolute';
        this.finished = true;
      }
    }
  }

  result() {
    const base = { screening: true, category: this.category, presentations: this.history.length };
    if (this.category === 'normal') return { ...base, threshold: this.level, flag: '>=' };
    if (this.category === 'relative') return { ...base, threshold: this.level, flag: '<' };
    return { ...base, threshold: this.minDb, flag: '<' };
  }
}
