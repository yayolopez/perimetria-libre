/** Utilidades compartidas por los módulos de pruebas. */
export { esc } from '../report.js';

/** Nombres de los controles según el equipo, para las instrucciones. */
export function controls(mode) {
  return mode === 'xr'
    ? { move: 'la palanca', confirm: 'el gatillo', alt: 'el botón A/X', finish: 'el botón B/Y' }
    : { move: 'las flechas del teclado', confirm: 'la barra espaciadora', alt: 'la tecla M', finish: 'la tecla F' };
}

/**
 * Intervalo en blanco entre ensayos: evita que el paciente responda dos veces
 * al mismo estímulo y reduce las imágenes residuales.
 */
export class TrialGap {
  constructor(seconds = 0.35) {
    this.seconds = seconds;
    this.remaining = 0;
  }

  start() {
    this.remaining = this.seconds;
  }

  get active() {
    return this.remaining > 0;
  }

  /** Devuelve true en el momento en que termina el intervalo (hay que redibujar). */
  tick(dt) {
    if (this.remaining <= 0) return false;
    this.remaining -= dt;
    return this.remaining <= 0;
  }
}

/** Mensaje temporal (por ejemplo, "Ahora: cerca"). */
export class Notice {
  constructor() {
    this.text = null;
    this.remaining = 0;
  }

  show(text, seconds = 1.5) {
    this.text = text;
    this.remaining = seconds;
  }

  tick(dt) {
    if (this.remaining <= 0) return false;
    this.remaining -= dt;
    if (this.remaining <= 0) {
      this.text = null;
      return true;
    }
    return false;
  }
}

/** Observador simulado de elección forzada (para el modo simulación). */
export const afcObserver = (rng, guess, slope) => (x, t) =>
  rng() < guess + (1 - guess - 0.02) / (1 + Math.exp(-(x - t) / slope));

export const fmt = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(d));

/** Advertencia común sobre límites del equipo y ausencia de normas. */
export const fineprint = (extra = '') =>
  `<p class="fineprint">${extra} Perimetría Libre · prueba de investigación, no es un dispositivo médico certificado.</p>`;
