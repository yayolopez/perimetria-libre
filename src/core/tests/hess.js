/**
 * Pantalla de Hess-Lancaster subjetiva. El ojo fijador ve una marca roja en
 * cada una de las 9 posiciones de mirada (campo interno de 15°); el otro ojo
 * ve una cruz verde que el paciente mueve hasta superponerla. La posición de
 * la cruz indica hacia dónde apunta el ojo no fijador. Luego se cambia el ojo
 * fijador. Con la imagen anclada a la cabeza, el paciente mueve los ojos y no
 * la cabeza, como en el examen clásico.
 */
import { degToPrismDiopters } from './phoria.js';

export const HESS_FIELD_DEG = 15;
export const HESS_POSITIONS = [
  [0, 0],
  [HESS_FIELD_DEG, 0],
  [-HESS_FIELD_DEG, 0],
  [0, HESS_FIELD_DEG],
  [0, -HESS_FIELD_DEG],
  [HESS_FIELD_DEG, HESS_FIELD_DEG],
  [-HESS_FIELD_DEG, HESS_FIELD_DEG],
  [HESS_FIELD_DEG, -HESS_FIELD_DEG],
  [-HESS_FIELD_DEG, -HESS_FIELD_DEG],
];

export class HessTest {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    const shuffled = () => {
      const a = [...HESS_POSITIONS];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    this.steps = [
      ...shuffled().map(([x, y]) => ({ fixingEye: 'OD', x, y })),
      ...shuffled().map(([x, y]) => ({ fixingEye: 'OI', x, y })),
    ];
    this.index = 0;
    this.records = [];
    this.resetCursor();
  }

  get finished() {
    return this.index >= this.steps.length;
  }

  get current() {
    return this.steps[this.index];
  }

  progress() {
    return this.index / this.steps.length;
  }

  resetCursor() {
    const s = this.current;
    if (!s) return;
    const angle = this.rng() * Math.PI * 2;
    const r = 3 + 3 * this.rng();
    this.cursor = { x: s.x + r * Math.cos(angle), y: s.y + r * Math.sin(angle) };
  }

  move(dx, dy) {
    const lim = HESS_FIELD_DEG + 12;
    this.cursor = {
      x: Math.max(-lim, Math.min(lim, this.cursor.x + dx)),
      y: Math.max(-lim, Math.min(lim, this.cursor.y + dy)),
    };
  }

  confirm() {
    const s = this.current;
    this.records.push({ ...s, cursorX: this.cursor.x, cursorY: this.cursor.y, dx: this.cursor.x - s.x, dy: this.cursor.y - s.y });
    this.index++;
    this.resetCursor();
  }

  result() {
    const forEye = (fixingEye) =>
      this.records
        .filter((r) => r.fixingEye === fixingEye)
        .map((r) => ({ ...r, deviationPd: degToPrismDiopters(Math.hypot(r.dx, r.dy)) }));
    const fixOD = forEye('OD');
    const fixOI = forEye('OI');
    const primary = (list) => list.find((r) => r.x === 0 && r.y === 0);
    const maxDev = (list) => Math.max(0, ...list.map((r) => r.deviationPd));
    return {
      // Con OD fijando se grafica el ojo izquierdo, y viceversa.
      leftEye: fixOD,
      rightEye: fixOI,
      primaryLeftPd: primary(fixOD) ? degToPrismDiopters(Math.hypot(primary(fixOD).dx, primary(fixOD).dy)) : null,
      primaryRightPd: primary(fixOI) ? degToPrismDiopters(Math.hypot(primary(fixOI).dx, primary(fixOI).dy)) : null,
      maxLeftPd: maxDev(fixOD),
      maxRightPd: maxDev(fixOI),
    };
  }
}
