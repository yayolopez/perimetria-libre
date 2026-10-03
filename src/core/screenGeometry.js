/**
 * Geometría para examinar en un monitor plano.
 *
 * En una pantalla plana un punto a (x°, y°) del eje visual cae en
 *   X = d · tan(x),   Y = d · tan(y) / cos(x)
 * (proyección gnomónica), con d = distancia ojo-pantalla. El punto de fijación
 * se desplaza del centro para que todo el patrón quepa en la pantalla.
 */
export const CARD_WIDTH_MM = 85.6; // tarjeta bancaria ISO/IEC 7810 ID-1
export const CARD_HEIGHT_MM = 53.98;
export const MIN_DISTANCE_MM = 250;
const EDGE_MARGIN_MM = 8;

const toRad = (deg) => (deg * Math.PI) / 180;

export function projectMm(xDeg, yDeg, distanceMm) {
  const az = toRad(xDeg);
  return { x: distanceMm * Math.tan(az), y: (distanceMm * Math.tan(toRad(yDeg))) / Math.cos(az) };
}

/** Radio en mm de un estímulo de `sizeDeg` en la posición (x°, y°). */
export function stimulusRadiusMm(sizeDeg, xDeg, yDeg, distanceMm) {
  const ecc = toRad(Math.hypot(xDeg, yDeg));
  return (distanceMm * Math.tan(toRad(sizeDeg / 2))) / Math.cos(ecc) ** 1.5;
}

/**
 * Ubica la fijación para que quepan todos los puntos.
 * Devuelve { fits, fixation: {x, y} (mm desde el centro de la pantalla), needed: {w, h} }.
 */
export function planScreen({ screenWmm, screenHmm, points, distanceMm }) {
  const proj = points.map((p) => projectMm(p.x, p.y, distanceMm));
  const xs = proj.map((p) => p.x);
  const ys = proj.map((p) => p.y);
  const minX = Math.min(0, ...xs);
  const maxX = Math.max(0, ...xs);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(0, ...ys);
  const needed = { w: maxX - minX + 2 * EDGE_MARGIN_MM, h: maxY - minY + 2 * EDGE_MARGIN_MM };
  return {
    fits: needed.w <= screenWmm && needed.h <= screenHmm,
    // Centro del campo en el centro de la pantalla. Y de pantalla hacia abajo = -y visual.
    fixation: { x: -(maxX + minX) / 2, y: (maxY + minY) / 2 },
    needed,
  };
}

/** Distancia máxima (mm) a la que el patrón entra completo en la pantalla. */
export function maxDistanceMm({ screenWmm, screenHmm, points }) {
  let lo = 50;
  let hi = 3000;
  if (!planScreen({ screenWmm, screenHmm, points, distanceMm: lo }).fits) return 0;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (planScreen({ screenWmm, screenHmm, points, distanceMm: mid }).fits) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Distancia recomendada: la mayor posible hasta 50 cm, redondeada a 1 cm hacia abajo. */
export function recommendedDistanceMm(args) {
  const max = maxDistanceMm(args);
  return Math.floor(Math.min(max, 500) / 10) * 10;
}

/**
 * Adición de cerca sugerida para la distancia de examen (aproximada).
 * Se supone que el paciente puede usar la mitad de su amplitud de acomodación
 * (Hofstetter mínima: 15 − 0.25 · edad).
 */
export function nearAddDiopters(distanceMm, age) {
  const demand = 1000 / distanceMm;
  const available = Number.isFinite(age) ? Math.max(0, 15 - 0.25 * age) / 2 : 0;
  return Math.max(0, Math.round((demand - available) * 4) / 4);
}
