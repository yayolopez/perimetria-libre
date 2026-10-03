/**
 * Foria subjetiva con disociación tipo Maddox: un ojo ve una luz puntual y el
 * otro solo una línea. Sin estímulo de fusión, los ojos van a su posición de
 * reposo; el paciente mueve la línea hasta que la ve pasar por la luz.
 *
 * El desplazamiento de la línea respecto de donde estaría con ortoforia indica
 * hacia dónde apunta el ojo de la línea:
 *   - temporal = exoforia, nasal = endoforia (línea vertical, foria horizontal)
 *   - arriba = hiperforia del ojo de la línea (línea horizontal, foria vertical)
 */
export const degToPrismDiopters = (deg) => 100 * Math.tan((deg * Math.PI) / 180);

const ORTHO_LIMIT_PD = 1; // por debajo de 1 Δ se informa ortoforia

export function interpretPhoria({ direction, offsetDeg, lineEye }) {
  const pd = degToPrismDiopters(Math.abs(offsetDeg));
  const rounded = Math.round(pd * 2) / 2;
  if (pd < ORTHO_LIMIT_PD) return { pd: rounded, type: 'Ortoforia' };
  if (direction === 'horizontal') {
    const temporal = lineEye === 'OD' ? offsetDeg > 0 : offsetDeg < 0;
    return { pd: rounded, type: temporal ? 'Exoforia' : 'Endoforia' };
  }
  const up = offsetDeg > 0;
  const hyperEye = up ? lineEye : lineEye === 'OD' ? 'OI' : 'OD';
  return { pd: rounded, type: `Hiperforia ${hyperEye === 'OD' ? 'derecha' : 'izquierda'}` };
}

export const PHORIA_DISTANCES = { lejos: 6, cerca: 0.4 };

export class PhoriaTest {
  /**
   * @param distances distancias de examen en metros (en pantalla, la de la pantalla).
   */
  constructor({ lineEye = 'OD', distances = PHORIA_DISTANCES, repetitions = 2, rng = Math.random }) {
    this.lineEye = lineEye;
    this.steps = [];
    for (const [distanceName, m] of Object.entries(distances)) {
      for (const direction of ['horizontal', 'vertical']) {
        for (let r = 0; r < repetitions; r++) this.steps.push({ distanceName, distanceM: m, direction });
      }
    }
    this.index = 0;
    this.rng = rng;
    this.measurements = [];
    this.resetOffset();
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

  resetOffset() {
    // Punto de partida al azar para que el paciente no repita la posición anterior.
    this.offsetDeg = (this.rng() < 0.5 ? -1 : 1) * (2 + 4 * this.rng());
  }

  move(deltaDeg) {
    this.offsetDeg = Math.max(-15, Math.min(15, this.offsetDeg + deltaDeg));
  }

  confirm() {
    this.measurements.push({ ...this.current, offsetDeg: this.offsetDeg });
    this.index++;
    this.resetOffset();
  }

  result() {
    const groups = new Map();
    for (const m of this.measurements) {
      const k = `${m.distanceName}|${m.direction}`;
      if (!groups.has(k)) groups.set(k, { distanceName: m.distanceName, distanceM: m.distanceM, direction: m.direction, values: [] });
      groups.get(k).values.push(m.offsetDeg);
    }
    return {
      lineEye: this.lineEye,
      measurements: [...groups.values()].map((g) => {
        const offsetDeg = g.values.reduce((a, b) => a + b, 0) / g.values.length;
        const spreadPd = degToPrismDiopters(Math.max(...g.values) - Math.min(...g.values));
        return { ...g, offsetDeg, spreadPd, ...interpretPhoria({ direction: g.direction, offsetDeg, lineEye: this.lineEye }) };
      }),
    };
  }
}
