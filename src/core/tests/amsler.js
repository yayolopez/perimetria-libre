/**
 * Rejilla de Amsler: 20 × 20 cuadros de 1°, con punto central de fijación.
 * El paciente (o el operador guiado por él) marca los cuadros donde las
 * líneas se ven torcidas (metamorfopsia) o faltan (escotoma).
 */
export const AMSLER_CELLS = 20;
export const AMSLER_CELL_DEG = 1;
export const MARK_TYPES = { distorted: 'Torcido', missing: 'Falta / borroso' };

const key = (i, j) => `${i},${j}`;

export class AmslerTest {
  constructor({ eye = 'OD' } = {}) {
    this.eye = eye;
    this.marks = new Map();
    this.cursor = { i: AMSLER_CELLS / 2, j: AMSLER_CELLS / 2 };
    this.mode = 'distorted';
    this.finished = false;
  }

  /** Centro del cuadro (i, j) en grados respecto de la fijación. */
  static cellCenter(i, j) {
    const half = AMSLER_CELLS / 2;
    return { x: (i - half + 0.5) * AMSLER_CELL_DEG, y: (half - j - 0.5) * AMSLER_CELL_DEG };
  }

  /** Cuadro bajo un punto en grados, o null si cae fuera de la rejilla. */
  static cellAt(xDeg, yDeg) {
    const half = AMSLER_CELLS / 2;
    const i = Math.floor(xDeg / AMSLER_CELL_DEG + half);
    const j = Math.floor(half - yDeg / AMSLER_CELL_DEG);
    return i >= 0 && i < AMSLER_CELLS && j >= 0 && j < AMSLER_CELLS ? { i, j } : null;
  }

  moveCursor(di, dj) {
    const clampCell = (v) => Math.max(0, Math.min(AMSLER_CELLS - 1, v));
    this.cursor = { i: clampCell(this.cursor.i + di), j: clampCell(this.cursor.j + dj) };
  }

  toggle(i = this.cursor.i, j = this.cursor.j, type = this.mode) {
    const k = key(i, j);
    if (this.marks.get(k) === type) this.marks.delete(k);
    else this.marks.set(k, type);
  }

  cycleMode() {
    this.mode = this.mode === 'distorted' ? 'missing' : 'distorted';
  }

  finish() {
    this.finished = true;
  }

  result() {
    const marks = [...this.marks].map(([k, type]) => {
      const [i, j] = k.split(',').map(Number);
      return { i, j, type };
    });
    const temporalSign = this.eye === 'OI' ? -1 : 1;
    const quadrants = { 'superior temporal': 0, 'superior nasal': 0, 'inferior temporal': 0, 'inferior nasal': 0 };
    for (const m of marks) {
      const c = AmslerTest.cellCenter(m.i, m.j);
      const vert = c.y > 0 ? 'superior' : 'inferior';
      const horiz = c.x * temporalSign > 0 ? 'temporal' : 'nasal';
      quadrants[`${vert} ${horiz}`]++;
    }
    const central = marks.filter((m) => {
      const c = AmslerTest.cellCenter(m.i, m.j);
      return Math.hypot(c.x, c.y) <= 2.5;
    }).length;
    return {
      marks,
      distorted: marks.filter((m) => m.type === 'distorted').length,
      missing: marks.filter((m) => m.type === 'missing').length,
      central,
      quadrants,
      normal: marks.length === 0,
    };
  }
}
