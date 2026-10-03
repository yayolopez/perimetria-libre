/**
 * Patrones de perimetría estática.
 *
 * Coordenadas en grados visuales respecto al punto de fijación, definidas para
 * el ojo derecho (OD) tal como las percibe el paciente:
 *   x > 0 = campo temporal (derecha), y > 0 = campo superior.
 * Para el ojo izquierdo (OI) se refleja el eje x.
 */

const range = (from, to, step) => {
  const out = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(v);
  return out;
};

// Fila simétrica arriba/abajo del meridiano horizontal.
const sym = (y, xs) => [[y, xs], [-y, xs]];

const fromRows = (rows) =>
  rows
    .flatMap(([y, xs]) => xs.map((x) => ({ x, y })))
    .sort((a, b) => b.y - a.y || a.x - b.x);

// 24-2: rejilla de 6° desplazada 3° de los meridianos, con escalón nasal a 27°.
const P24_2 = fromRows([
  ...sym(21, range(-9, 9, 6)),
  ...sym(15, range(-15, 15, 6)),
  ...sym(9, range(-21, 21, 6)),
  ...sym(3, range(-27, 21, 6)),
]);

// 30-2: rejilla de 6° hasta 30° de excentricidad.
const P30_2 = fromRows([
  ...sym(27, range(-9, 9, 6)),
  ...sym(21, range(-15, 15, 6)),
  ...sym(15, range(-21, 21, 6)),
  ...sym(9, range(-27, 27, 6)),
  ...sym(3, range(-27, 27, 6)),
]);

// 10-2: rejilla de 2° desplazada 1°, puntos dentro de ~9.1° (68 puntos).
const P10_2 = fromRows(
  range(-9, 9, 2).map((y) => [y, range(-9, 9, 2).filter((x) => x * x + y * y <= 82)]),
);

export const PATTERNS = {
  '24-2': { id: '24-2', label: '24-2 · 54 puntos, rejilla 6°', spacing: 6, points: P24_2 },
  '30-2': { id: '30-2', label: '30-2 · 76 puntos, rejilla 6°', spacing: 6, points: P30_2 },
  '10-2': { id: '10-2', label: '10-2 · 68 puntos, rejilla 2°', spacing: 2, points: P10_2 },
};

export const EYES = { OD: 'OD', OI: 'OI' };

// En OD los puntos (15, ±3) caen sobre la mancha ciega fisiológica.
const isBlindSpotPoint = (pt, spacing) => spacing === 6 && pt.x === 15 && Math.abs(pt.y) === 3;

/** Devuelve los puntos del patrón para el ojo indicado. */
export function getPattern(id, eye = EYES.OD) {
  const pattern = PATTERNS[id];
  if (!pattern) throw new Error(`Patrón desconocido: ${id}`);
  const mirror = eye === EYES.OI ? -1 : 1;
  return pattern.points.map((pt, i) => ({
    id: i,
    x: pt.x * mirror,
    y: pt.y,
    blindSpot: isBlindSpotPoint(pt, pattern.spacing),
  }));
}

/** Ubicación nominal de la mancha ciega (Heijl-Krakau) para control de fijación. */
export function blindSpotLocation(eye = EYES.OD) {
  return { x: eye === EYES.OI ? -15 : 15, y: -1.5 };
}

export const eccentricity = (p) => Math.hypot(p.x, p.y);
