/**
 * Base normativa e índices globales.
 *
 * Una base normativa describe, para cada punto del patrón (en coordenadas de
 * OD), el umbral esperado según la edad y su variabilidad en sujetos sanos:
 *   esperado(edad) = intercept + slope · (edad − refAge)
 *
 * Con ella se calculan:
 *   - Desviación total (TD) = umbral − esperado
 *   - Altura general = percentil 85 de TD (7.º mejor de 52 puntos)
 *   - Desviación patrón (PD) = TD − altura general
 *   - MD  = media de TD ponderada por 1/DE²
 *   - PSD = raíz de la varianza ponderada de TD alrededor de MD
 *   - Probabilidades por punto (p < 5, 2, 1, 0.5 %) suponiendo normalidad.
 *
 * Cada dispositivo necesita su propia base: los valores del Humphrey no
 * sirven para un visor VR ni para un monitor.
 */
import { normalCdf } from './math.js';

export const P_LEVELS = [0.005, 0.01, 0.02, 0.05];
export const REF_AGE = 50;
export const MIN_SUBJECTS_RECOMMENDED = 60;

const key = (x, y) => `${x},${y}`;
const toOD = (p, eye) => ({ x: eye === 'OI' ? -p.x : p.x, y: p.y });
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs, ddof = 1) => {
  if (xs.length <= ddof) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - ddof));
};
const quantile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.ceil(pos)] - s[lo]) * (pos - lo);
};

/** Clase de probabilidad (cola inferior) o null si p ≥ 5 %. */
export function pClassFromZ(z) {
  const p = normalCdf(z);
  return P_LEVELS.find((lvl) => p < lvl) ?? null;
}

/** Grupo de modo con el que debe coincidir la base normativa. */
export const modeGroup = (mode) => (mode === 'screen' ? 'screen' : mode === 'simulation' ? 'simulation' : 'xr');

export function normativeMatches(norm, result) {
  const size = result.meta?.stimulusSizeDeg ?? 0.431;
  return (
    norm.patternId === result.config.patternId &&
    Math.abs((norm.stimulusSizeDeg ?? 0.431) - size) < 0.01 &&
    norm.mode === modeGroup(result.meta?.mode)
  );
}

/** Punto usable para estadística: medido, numérico, fuera de mancha ciega y fóvea. */
const usable = (p) => p.finished !== false && !p.blindSpot && !p.foveal && !p.screening;

/** Umbral esperado para un punto del resultado (o null si la base no lo tiene). */
export function expectedFor(norm, point, eye, age) {
  const od = toOD(point, eye);
  const np = norm.points.find((q) => q.x === od.x && q.y === od.y);
  return np ? np.intercept + np.slope * (age - (norm.refAge ?? REF_AGE)) : null;
}

/** Calcula TD, PD, MD, PSD y probabilidades. */
export function analyse(result, norm) {
  const age = result.meta?.age;
  if (!Number.isFinite(age)) return { error: 'Falta la edad del paciente: no se pueden calcular MD/PSD.' };
  if (result.points.some((p) => p.screening)) return { error: 'Los índices no se calculan en exámenes de tamizaje.' };

  const table = new Map(norm.points.map((q) => [key(q.x, q.y), q]));
  const refAge = norm.refAge ?? REF_AGE;
  const rows = [];
  for (const p of result.points) {
    if (!usable(p)) continue;
    const od = toOD(p, result.config.eye);
    const np = table.get(key(od.x, od.y));
    if (!np) continue;
    const expected = np.intercept + np.slope * (age - refAge);
    rows.push({ id: p.id, x: p.x, y: p.y, expected, td: p.threshold - expected, sd: np.sd, pdSd: np.pdSd ?? np.sd });
  }
  if (rows.length < 10) return { error: 'Muy pocos puntos coinciden con la base normativa.' };

  const ranked = rows.map((r) => r.td).sort((a, b) => b - a);
  const generalHeight = ranked[Math.max(0, Math.round(rows.length * (7 / 52)) - 1)];
  for (const r of rows) {
    r.pd = r.td - generalHeight;
    r.tdP = pClassFromZ(r.td / r.sd);
    r.pdP = pClassFromZ(r.pd / r.pdSd);
  }

  const w = rows.map((r) => 1 / r.sd ** 2);
  const md = rows.reduce((a, r, i) => a + r.td * w[i], 0) / w.reduce((a, b) => a + b, 0);
  const n = rows.length;
  const meanVar = rows.reduce((a, r) => a + r.sd ** 2, 0) / n;
  const psd = Math.sqrt((meanVar / (n - 1)) * rows.reduce((a, r) => a + (r.td - md) ** 2 / r.sd ** 2, 0));

  const idx = norm.indices ?? {};
  const mdP = idx.mdSd ? pClassFromZ(md / idx.mdSd) : null;
  let psdP = null;
  if (idx.psdPercentiles) {
    const pp = idx.psdPercentiles;
    psdP = psd > pp.p995 ? 0.005 : psd > pp.p99 ? 0.01 : psd > pp.p98 ? 0.02 : psd > pp.p95 ? 0.05 : null;
  }

  return {
    rows,
    md,
    psd,
    mdP,
    psdP,
    generalHeight,
    normative: { id: norm.id, name: norm.name, n: norm.n, synthetic: Boolean(norm.synthetic) },
  };
}

/**
 * Construye una base normativa a partir de exámenes de sujetos sanos del mismo
 * patrón, tamaño de estímulo y tipo de dispositivo.
 */
export function buildNormative({ id, name, results, refAge = REF_AGE }) {
  const valid = results.filter((r) => Number.isFinite(r.meta?.age) && r.points.every((p) => !p.screening));
  if (valid.length < 3) throw new Error('Se necesitan al menos 3 exámenes de sujetos normales con edad.');
  const first = valid[0];
  const group = {
    patternId: first.config.patternId,
    stimulusSizeDeg: first.meta.stimulusSizeDeg ?? 0.431,
    mode: modeGroup(first.meta.mode),
  };
  if (valid.some((r) => !normativeMatches({ ...group }, r))) {
    throw new Error('Todos los exámenes deben tener el mismo patrón, tamaño de estímulo y dispositivo.');
  }

  // Datos por punto en coordenadas de OD; se excluyen valores censurados.
  const byPoint = new Map();
  for (const r of valid) {
    for (const p of r.points) {
      if (!usable(p) || p.flag) continue;
      const od = toOD(p, r.config.eye);
      const k = key(od.x, od.y);
      if (!byPoint.has(k)) byPoint.set(k, { x: od.x, y: od.y, data: [] });
      byPoint.get(k).data.push({ age: r.meta.age, t: p.threshold });
    }
  }

  // Pendiente de edad común (datos centrados por punto): estable con pocos sujetos.
  let sxy = 0;
  let sxx = 0;
  for (const { data } of byPoint.values()) {
    if (data.length < 3) continue;
    const ma = mean(data.map((d) => d.age));
    const mt = mean(data.map((d) => d.t));
    for (const d of data) {
      sxy += (d.age - ma) * (d.t - mt);
      sxx += (d.age - ma) ** 2;
    }
  }
  const pooledSlope = sxx > 0 ? sxy / sxx : 0;

  const points = [];
  for (const { x, y, data } of byPoint.values()) {
    if (data.length < 3) continue;
    const ages = data.map((d) => d.age);
    const ageSpan = Math.max(...ages) - Math.min(...ages);
    let slope = pooledSlope;
    if (data.length >= 30 && ageSpan >= 30) {
      const ma = mean(ages);
      const mt = mean(data.map((d) => d.t));
      const cov = data.reduce((a, d) => a + (d.age - ma) * (d.t - mt), 0);
      const vr = data.reduce((a, d) => a + (d.age - ma) ** 2, 0);
      slope = cov / vr;
    }
    const intercept = mean(data.map((d) => d.t - slope * (d.age - refAge)));
    const resid = data.map((d) => d.t - (intercept + slope * (d.age - refAge)));
    points.push({ x, y, intercept, slope, sd: Math.max(0.8, sd(resid, 2) || 0.8), n: data.length });
  }

  const ages = valid.map((r) => r.meta.age);
  const norm = {
    id,
    name,
    ...group,
    n: valid.length,
    ageRange: [Math.min(...ages), Math.max(...ages)],
    refAge,
    points,
    synthetic: false,
    createdAt: new Date().toISOString(),
  };

  // DE de la desviación patrón por punto y distribución de MD/PSD en normales.
  const pdByPoint = new Map();
  const mds = [];
  const psds = [];
  for (const r of valid) {
    const a = analyse(r, norm);
    if (a.error) continue;
    mds.push(a.md);
    psds.push(a.psd);
    for (const row of a.rows) {
      const od = toOD(row, r.config.eye);
      const k = key(od.x, od.y);
      if (!pdByPoint.has(k)) pdByPoint.set(k, []);
      pdByPoint.get(k).push(row.pd);
    }
  }
  for (const p of points) {
    const pds = pdByPoint.get(key(p.x, p.y)) ?? [];
    p.pdSd = pds.length >= 3 ? Math.max(0.7, sd(pds)) : p.sd;
  }
  if (mds.length >= 3) {
    norm.indices = {
      mdSd: sd(mds),
      psdPercentiles: {
        p95: quantile(psds, 0.95),
        p98: quantile(psds, 0.98),
        p99: quantile(psds, 0.99),
        p995: quantile(psds, 0.995),
      },
    };
  }
  return norm;
}
