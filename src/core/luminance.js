/**
 * Escala de decibeles y conversión a valores de pantalla.
 *
 * Se usa la escala del Humphrey: 0 dB = incremento de 10 000 asb sobre el fondo,
 * dB = 10·log10(10000 / ΔL[asb]). 1 cd/m² = π asb.
 *
 * Un visor VR no alcanza 10 000 asb, así que el rango útil queda acotado:
 * `Display.range()` informa el estímulo más brillante y el más tenue que el
 * dispositivo calibrado puede producir sobre el fondo elegido.
 */

export const HFA_MAX_ASB = 10000;
export const STANDARD_BACKGROUND_CDM2 = 31.5 / Math.PI; // 31.5 asb ≈ 10 cd/m²

export const asbToCdm2 = (asb) => asb / Math.PI;
export const cdm2ToAsb = (cdm2) => cdm2 * Math.PI;

export const dbToAsb = (db) => HFA_MAX_ASB * Math.pow(10, -db / 10);
export const asbToDb = (asb) => (asb > 0 ? 10 * Math.log10(HFA_MAX_ASB / asb) : Infinity);

export const dbToCdm2 = (db) => asbToCdm2(dbToAsb(db));
export const cdm2ToDb = (cdm2) => asbToDb(cdm2ToAsb(cdm2));

/**
 * Construye la tabla luminancia(cd/m²) por código digital a partir de un perfil:
 *   { model: 'gamma', gamma, minCdm2, maxCdm2, bits }
 *   { model: 'lut', points: [[valor 0..1, cd/m²], ...], bits }
 */
export function buildLuminanceTable(profile) {
  const levels = 2 ** (profile.bits ?? 8);
  const table = new Float64Array(levels);

  if (profile.model === 'gamma') {
    const { gamma, minCdm2, maxCdm2 } = profile;
    for (let i = 0; i < levels; i++) {
      table[i] = minCdm2 + (maxCdm2 - minCdm2) * Math.pow(i / (levels - 1), gamma);
    }
  } else if (profile.model === 'lut') {
    const pts = [...profile.points].sort((a, b) => a[0] - b[0]);
    if (pts.length < 2) throw new Error('La tabla de calibración necesita al menos 2 mediciones');
    for (let i = 0; i < levels; i++) {
      const v = i / (levels - 1);
      let k = pts.findIndex((p) => p[0] >= v);
      if (k <= 0) k = k === 0 ? 1 : pts.length - 1;
      const [v0, l0] = pts[k - 1];
      const [v1, l1] = pts[k];
      const t = v1 === v0 ? 0 : (v - v0) / (v1 - v0);
      table[i] = l0 + Math.min(Math.max(t, 0), 1) * (l1 - l0);
    }
  } else {
    throw new Error(`Modelo de perfil desconocido: ${profile.model}`);
  }

  for (let i = 1; i < levels; i++) {
    if (table[i] < table[i - 1]) {
      throw new Error('La calibración no es monótona: revise las mediciones');
    }
  }
  return table;
}

function nearestCode(table, cdm2) {
  let lo = 0;
  let hi = table.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid] < cdm2) lo = mid;
    else hi = mid;
  }
  return Math.abs(table[lo] - cdm2) <= Math.abs(table[hi] - cdm2) ? lo : hi;
}

/** Pantalla calibrada con un fondo fijo. */
export class Display {
  constructor(profile, backgroundCdm2 = STANDARD_BACKGROUND_CDM2) {
    this.profile = profile;
    this.table = buildLuminanceTable(profile);
    this.levels = this.table.length;
    this.backgroundCode = nearestCode(this.table, backgroundCdm2);
    this.backgroundCdm2 = this.table[this.backgroundCode];
    this.backgroundValue = this.backgroundCode / (this.levels - 1);
    if (this.backgroundCode >= this.levels - 1) {
      throw new Error('El fondo pedido es tan brillante como el máximo del visor');
    }
  }

  /** Rango en dB realizable: minDb = estímulo más brillante, maxDb = más tenue. */
  range() {
    const top = this.table[this.levels - 1] - this.backgroundCdm2;
    const step = this.table[this.backgroundCode + 1] - this.backgroundCdm2;
    return { minDb: cdm2ToDb(top), maxDb: cdm2ToDb(step) };
  }

  /** Rango entero que usan las estrategias (acotado a 40 dB). */
  integerRange() {
    const { minDb, maxDb } = this.range();
    return { minDb: Math.ceil(minDb), maxDb: Math.min(40, Math.floor(maxDb)) };
  }

  /** Valor de pantalla para un estímulo de `db` decibeles. */
  stimulus(db) {
    const target = this.backgroundCdm2 + dbToCdm2(db);
    let code = nearestCode(this.table, target);
    let clipped = null;
    if (code <= this.backgroundCode) {
      code = this.backgroundCode + 1;
      clipped = 'dim';
    }
    if (target > this.table[this.levels - 1]) clipped = 'bright';
    const cdm2 = this.table[code];
    return {
      code,
      value: code / (this.levels - 1),
      cdm2,
      realizedDb: cdm2ToDb(cdm2 - this.backgroundCdm2),
      clipped,
    };
  }
}
