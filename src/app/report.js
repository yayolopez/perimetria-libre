/**
 * Informe de resultados con el formato habitual de un campímetro:
 * umbrales, escala de grises, desviación total y patrón (numéricas y de
 * probabilidad), índices globales, confiabilidad y gráfica de mirada.
 */
import { PATTERNS } from '../core/patterns.js';
import { STRATEGIES } from '../core/procedure.js';
import { formatThreshold, RELIABILITY_LIMITS } from '../core/results.js';
import { GOLDMANN_SIZES, FIXATION_TARGETS, SPEEDS } from '../core/options.js';

const SIZE = 300;
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const fmtP = (p) => (p === null || p === undefined ? '' : `p < ${p * 100}%`);
const fmtDb = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)} dB`);

/** Marco común de los mapas: escala, ejes y una función por punto. */
function mapSvg({ points, spacing, cls, label, cell }) {
  const extent = Math.max(...points.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)))) + spacing / 2;
  const scale = (SIZE - 30) / (2 * extent);
  const geo = {
    cx: (x) => SIZE / 2 + x * scale,
    cy: (y) => SIZE / 2 - y * scale,
    side: spacing * scale,
  };
  return `<svg class="field ${cls}" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="${esc(label)}">
    <line x1="10" y1="${SIZE / 2}" x2="${SIZE - 10}" y2="${SIZE / 2}" class="axis"/>
    <line x1="${SIZE / 2}" y1="10" x2="${SIZE / 2}" y2="${SIZE - 10}" class="axis"/>
    ${points.map((p) => cell(p, geo)).join('')}
  </svg>`;
}

const textCell = (text, cls = '') => (p, g) =>
  `<text x="${g.cx(p.x)}" y="${g.cy(p.y)}" class="${cls}">${esc(text(p))}</text>`;

export function numericSvg(result) {
  const spacing = PATTERNS[result.config.patternId].spacing;
  const points = result.points.filter((p) => !p.foveal);
  return mapSvg({
    points,
    spacing,
    cls: 'field--numeric',
    label: 'Umbrales en dB',
    cell: (p, g) => {
      const cls = p.blindSpot ? 'bs' : p.flag === '<' ? 'low' : '';
      return textCell(() => formatThreshold(p), cls)(p, g);
    },
  });
}

export function graySvg(result) {
  const spacing = PATTERNS[result.config.patternId].spacing;
  return mapSvg({
    points: result.points.filter((p) => !p.foveal),
    spacing,
    cls: 'field--gray',
    label: 'Escala de grises',
    cell: (p, g) => {
      if (p.finished === false) return '';
      const v = p.screening
        ? { normal: 0.85, relative: 0.45, absolute: 0 }[p.category] ?? 1
        : p.flag === '<' ? 0 : Math.min(Math.max(p.threshold / 35, 0), 1);
      const c = Math.round(v * 255);
      return `<rect x="${g.cx(p.x) - g.side / 2}" y="${g.cy(p.y) - g.side / 2}" width="${g.side}" height="${g.side}" fill="rgb(${c},${c},${c})"/>`;
    },
  });
}

/** Símbolos de probabilidad (como en los campímetros): más oscuro = menos probable en sanos. */
const P_SYMBOL = {
  0.05: { fill: 0.78, label: 'p < 5%' },
  0.02: { fill: 0.55, label: 'p < 2%' },
  0.01: { fill: 0.3, label: 'p < 1%' },
  0.005: { fill: 0, label: 'p < 0.5%' },
};

function probabilityCell(p, g, level) {
  const s = g.side * 0.42;
  const x = g.cx(p.x);
  const y = g.cy(p.y);
  if (!level) return `<circle cx="${x}" cy="${y}" r="1.3" class="dot"/>`;
  const c = Math.round(P_SYMBOL[level].fill * 255);
  return `<rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" fill="rgb(${c},${c},${c})" stroke="#000" stroke-width="0.6"/>`;
}

function deviationSvgs(result, analysis) {
  const spacing = PATTERNS[result.config.patternId].spacing;
  const rows = analysis.rows;
  const fmt = (v) => `${Math.round(v)}`;
  return {
    td: mapSvg({ points: rows, spacing, cls: 'field--numeric', label: 'Desviación total', cell: textCell((r) => fmt(r.td)) }),
    pd: mapSvg({ points: rows, spacing, cls: 'field--numeric', label: 'Desviación patrón', cell: textCell((r) => fmt(r.pd)) }),
    tdP: mapSvg({ points: rows, spacing, cls: 'field--prob', label: 'Probabilidad de desviación total', cell: (r, g) => probabilityCell(r, g, r.tdP) }),
    pdP: mapSvg({ points: rows, spacing, cls: 'field--prob', label: 'Probabilidad de desviación patrón', cell: (r, g) => probabilityCell(r, g, r.pdP) }),
  };
}

const probabilityLegend = () => `<div class="legend">
  ${Object.entries(P_SYMBOL)
    .map(([, s]) => {
      const c = Math.round(s.fill * 255);
      return `<span><svg width="12" height="12"><rect x="1" y="1" width="10" height="10" fill="rgb(${c},${c},${c})" stroke="#000" stroke-width="0.6"/></svg>${s.label}</span>`;
    })
    .join('')}
</div>`;

/** Gráfica de mirada: barras hacia arriba = desviación; hacia abajo = parpadeo o sin ojo. */
function gazeSvg(gaze) {
  const trace = gaze.trace;
  const W = 640;
  const H = 70;
  const mid = H / 2;
  const step = W / Math.max(trace.length, 1);
  const bars = trace
    .map((s, i) => {
      const x = i * step;
      if (s.blink || s.lost) return `<rect x="${x}" y="${mid}" width="${Math.max(1, step - 0.5)}" height="${mid - 4}" class="gz-down"/>`;
      const h = Math.min(mid - 4, (s.dev / 10) * (mid - 4));
      return `<rect x="${x}" y="${mid - h}" width="${Math.max(1, step - 0.5)}" height="${h}" class="gz-up"/>`;
    })
    .join('');
  return `<svg class="gaze" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Gráfica de mirada">
    <line x1="0" x2="${W}" y1="${mid}" y2="${mid}" class="axis"/>${bars}</svg>`;
}

const pct = (r) => (r.rate === null ? '—' : `${r.events}/${r.trials} (${Math.round(r.rate * 100)}%)`);
const duration = (ms) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}` : '—');

const MODE_LABEL = { xr: 'Visor VR', screen: 'Pantalla', simulation: 'Simulación' };

/**
 * @param analysis resultado de analyse(), { error } o null si no hay base normativa.
 */
export function renderReport(result, analysis = null) {
  const { meta, config, reliability, stats } = result;
  const warn = (key) => (reliability.warnings.includes(key) ? ' class="warn"' : '');
  const date = new Date(result.createdAt);
  const opts = meta.options ?? {};
  const screening = result.points.some((p) => p.screening);
  const sizeLabel = GOLDMANN_SIZES[opts.size]?.label.split(' (')[0] ?? `${meta.stimulusSizeDeg ?? 0.43}°`;
  const banners = [];
  if (meta.mode === 'simulation') banners.push('<p class="banner banner--sim">SIMULACIÓN · datos ficticios generados por el programa</p>');
  if (stats.completedPoints < result.points.length) {
    banners.push(`<p class="banner">Examen incompleto · ${stats.completedPoints} de ${result.points.length} puntos medidos (· = sin medir)</p>`);
  }
  if (meta.mode === 'screen' && !meta.screen?.calibrated) banners.push('<p class="banner">Pantalla sin calibrar · escala angular aproximada, solo demostración</p>');
  if (meta.profile && !meta.profile.calibrated && meta.mode !== 'simulation') banners.push('<p class="banner">Luminancia sin calibrar · los dB son aproximados</p>');
  if (analysis?.normative?.synthetic && meta.mode === 'simulation') banners.push('<p class="banner banner--sim">Base normativa SINTÉTICA · MD/PSD sin validez clínica</p>');

  let deviation = '';
  if (analysis && !analysis.error) {
    const s = deviationSvgs(result, analysis);
    deviation = `
      <div class="report__maps report__maps--4">
        <figure>${s.td}<figcaption>Desviación total (dB)</figcaption></figure>
        <figure>${s.pd}<figcaption>Desviación patrón (dB)</figcaption></figure>
        <figure>${s.tdP}<figcaption>Probabilidad · desviación total</figcaption></figure>
        <figure>${s.pdP}<figcaption>Probabilidad · desviación patrón</figcaption></figure>
      </div>
      ${probabilityLegend()}`;
  }

  const indexRows =
    analysis && !analysis.error
      ? `<tr><th>MD (desviación media)</th><td>${fmtDb(analysis.md)} <span class="p">${fmtP(analysis.mdP)}</span></td></tr>
         <tr><th>PSD (desviación estándar del patrón)</th><td>${fmtDb(analysis.psd).replace('+', '')} <span class="p">${fmtP(analysis.psdP)}</span></td></tr>`
      : `<tr><th>MD / PSD</th><td class="muted">${esc(analysis?.error ?? 'Sin base normativa para este patrón y dispositivo')}</td></tr>`;

  const gaze = meta.gaze;
  const gazeBlock = gaze?.trace?.length
    ? `<section class="report__gaze"><h3>Seguimiento de mirada (cámara, experimental)</h3>${gazeSvg(gaze)}
       <p class="muted">Arriba: desviación (escala 0–10°). Abajo: parpadeo o sin ojo detectado. ${gaze.rejected} estímulos repetidos por mala fijación.</p></section>`
    : '';

  return `
    ${banners.join('')}
    <header class="report__head">
      <div><span class="k">Paciente</span><span>${esc(meta.patientId) || '—'}</span></div>
      <div><span class="k">Edad</span><span>${esc(meta.age) || '—'}</span></div>
      <div><span class="k">Ojo</span><span>${esc(config.eye)}</span></div>
      <div><span class="k">Fecha</span><span>${esc(date.toLocaleDateString('es'))} ${esc(date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }))}</span></div>
      <div><span class="k">Patrón</span><span>${esc(config.patternId)}</span></div>
      <div><span class="k">Estrategia</span><span>${esc(STRATEGIES[config.strategy]?.label ?? config.strategy)}</span></div>
      <div><span class="k">Estímulo</span><span>Goldmann ${esc(sizeLabel)}, blanco, ${esc(opts.durationMs ?? 200)} ms</span></div>
      <div><span class="k">Fondo</span><span>${meta.backgroundCdm2 ? (meta.backgroundCdm2 * Math.PI).toFixed(1) + ' asb' : '—'}</span></div>
      <div><span class="k">Equipo</span><span>${esc(MODE_LABEL[meta.mode] ?? meta.mode)}${meta.screen?.distanceMm ? ` · ${Math.round(meta.screen.distanceMm / 10)} cm` : ''}</span></div>
      <div><span class="k">Perfil de luminancia</span><span>${esc(meta.profile?.name ?? '—')}</span></div>
      <div><span class="k">Fijación</span><span>${esc(FIXATION_TARGETS[opts.fixation] ?? 'Punto central')}</span></div>
      <div><span class="k">Corrección usada</span><span>${esc(meta.correction) || '—'}</span></div>
    </header>
    <div class="report__maps">
      <figure>${numericSvg(result)}<figcaption>${screening ? 'Tamizaje: ○ normal · ◧ relativo · ■ absoluto' : 'Umbrales (dB)'}</figcaption></figure>
      <figure>${graySvg(result)}<figcaption>Escala de grises</figcaption></figure>
    </div>
    ${deviation}
    <div class="report__tables">
      <table>
        <caption>Índices</caption>
        ${indexRows}
        <tr><th>Sensibilidad media</th><td>${stats.meanSensitivity === null ? '—' : stats.meanSensitivity.toFixed(1) + ' dB'}</td></tr>
        ${stats.fovealThreshold ? `<tr><th>Umbral foveal</th><td>${esc(stats.fovealThreshold)} dB</td></tr>` : ''}
        <tr><th>Duración del examen</th><td>${meta.mode === 'simulation' ? '—' : duration(meta.elapsedMs ?? stats.durationMs)}</td></tr>
        <tr><th>Estímulos presentados</th><td>${stats.presentations}</td></tr>
        <tr><th>Tiempo de reacción medio</th><td>${stats.meanResponseTimeMs === null ? '—' : Math.round(stats.meanResponseTimeMs) + ' ms'}</td></tr>
      </table>
      <table>
        <caption>Confiabilidad</caption>
        <tr${warn('fixationLosses')}><th>Pérdidas de fijación</th><td>${pct(reliability.fixationLosses)}</td><td class="lim">límite ${RELIABILITY_LIMITS.fixationLosses * 100}%</td></tr>
        <tr${warn('falsePositives')}><th>Falsos positivos</th><td>${pct(reliability.falsePositives)}</td><td class="lim">límite ${RELIABILITY_LIMITS.falsePositives * 100}%</td></tr>
        <tr${warn('falseNegatives')}><th>Falsos negativos</th><td>${pct(reliability.falseNegatives)}</td><td class="lim">límite ${RELIABILITY_LIMITS.falseNegatives * 100}%</td></tr>
        <tr><th>Respuestas fuera de tiempo</th><td>${reliability.outOfWindowResponses}</td><td></td></tr>
        <tr><th>Velocidad</th><td>${esc(SPEEDS[opts.speed]?.label ?? 'Normal')}</td><td></td></tr>
      </table>
    </div>
    ${gazeBlock}
    ${meta.notes ? `<p><b>Observaciones:</b> ${esc(meta.notes)}</p>` : ''}
    <p class="fineprint">
      ${analysis && !analysis.error ? `Base normativa: ${esc(analysis.normative.name)} (n = ${analysis.normative.n}). ` : ''}
      Perimetría Libre ${esc(result.version)} · prototipo de investigación, no es un dispositivo médico certificado.</p>`;
}

/** Mapa en vivo para el monitor del operador. */
export function liveFieldSvg({ points, spacing, labels, currentId }) {
  return mapSvg({
    points,
    spacing,
    cls: 'field--numeric field--live',
    label: 'Progreso del examen',
    cell: (p, g) => {
      const x = g.cx(p.x);
      const y = g.cy(p.y);
      const ring = p.id === currentId ? `<circle cx="${x}" cy="${y}" r="${g.side * 0.42}" class="current"/>` : '';
      const label = labels[p.id];
      return ring + (label ? `<text x="${x}" y="${y}">${esc(label)}</text>` : `<circle cx="${x}" cy="${y}" r="1.5" class="dot"/>`);
    },
  });
}
