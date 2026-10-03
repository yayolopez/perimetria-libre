/**
 * Perfiles de luminancia de los visores.
 *
 * IMPORTANTE: el perfil genérico es una suposición (gamma 2.2, 100 cd/m²).
 * Los resultados solo son comparables entre equipos si cada visor se calibra
 * con un fotómetro (ver docs/CALIBRACION.md) y se guarda su propio perfil.
 */
export const BUILTIN_PROFILES = [
  {
    id: 'generico',
    name: 'Genérico (SIN CALIBRAR)',
    calibrated: false,
    model: 'gamma',
    gamma: 2.2,
    minCdm2: 0.05,
    maxCdm2: 100,
    bits: 8,
  },
];

/** Crea un perfil a partir de mediciones "código (0-255), cd/m²". */
export function profileFromMeasurements({ id, name, measurements, bits = 8 }) {
  const maxCode = 2 ** bits - 1;
  const points = measurements
    .filter(([code, cdm2]) => Number.isFinite(code) && Number.isFinite(cdm2))
    .map(([code, cdm2]) => [code / maxCode, cdm2]);
  return { id, name, calibrated: true, model: 'lut', points, bits, createdAt: new Date().toISOString() };
}

/** Niveles a medir durante la calibración (pasos de 16 + extremos). */
export const CALIBRATION_LEVELS = [...Array.from({ length: 16 }, (_, i) => i * 16), 255];
