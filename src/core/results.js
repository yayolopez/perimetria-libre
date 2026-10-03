/**
 * Resumen de resultados. Los índices que dependen de una base normativa
 * (TD, PD, MD, PSD) se calculan aparte, en normative.js, para poder aplicarlos
 * también a exámenes antiguos cuando haya una base disponible.
 */
export const VERSION = '0.3.0';

// Convenciones clínicas habituales; ajustables.
export const RELIABILITY_LIMITS = {
  fixationLosses: 0.2,
  falsePositives: 0.15,
  falseNegatives: 0.33,
};

const rate = (events, trials) => ({ events, trials, rate: trials ? events / trials : null });

export function summarize(session, meta = {}) {
  const points = session.states.map(({ point, strategy }) => ({
    ...point,
    ...strategy.result(),
    finished: strategy.finished,
  }));
  const ofKind = (kind) => session.log.filter((t) => t.kind === kind);

  const fix = ofKind('fixation');
  const fp = ofKind('falsePositive');
  const fn = ofKind('falseNegative');
  const reliability = {
    fixationLosses: rate(fix.filter((t) => t.seen).length, fix.length),
    falsePositives: rate(fp.filter((t) => t.seen).length, fp.length),
    falseNegatives: rate(fn.filter((t) => !t.seen).length, fn.length),
    outOfWindowResponses: session.outOfWindowResponses,
  };
  reliability.warnings = Object.entries(RELIABILITY_LIMITS)
    .filter(([key, limit]) => reliability[key].rate !== null && reliability[key].rate > limit)
    .map(([key]) => key);

  const analysed = points.filter((p) => p.finished && !p.blindSpot && !p.foveal && !p.screening);
  const foveal = points.find((p) => p.foveal && p.finished);
  const stimuli = ofKind('stimulus');
  const rts = stimuli.filter((t) => t.seen && t.responseTimeMs !== null).map((t) => t.responseTimeMs);
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  return {
    app: 'perimetria-libre',
    version: VERSION,
    createdAt: new Date().toISOString(),
    meta,
    config: session.config,
    points,
    reliability,
    stats: {
      meanSensitivity: mean(analysed.map((p) => p.threshold)),
      completedPoints: points.filter((p) => p.finished).length,
      fovealThreshold: foveal ? formatThreshold(foveal) : null,
      presentations: stimuli.length,
      totalTrials: session.log.length,
      durationMs: session.startedAt
        ? (session.finishedAt ?? session.log.at(-1)?.t ?? session.startedAt) - session.startedAt
        : null,
      meanResponseTimeMs: mean(rts),
    },
    log: session.log,
  };
}

/** Contadores en vivo para el monitor del operador (sin calcular todo el resumen). */
export function liveCounters(session) {
  const c = { fixation: [0, 0], falsePositive: [0, 0], falseNegative: [0, 0] };
  for (const t of session.log) {
    if (!(t.kind in c)) continue;
    c[t.kind][1]++;
    if (t.kind === 'falseNegative' ? !t.seen : t.seen) c[t.kind][0]++;
  }
  return c;
}

/** Etiquetas de los puntos ya terminados: { id: '28' }. */
export function finishedLabels(session) {
  const labels = {};
  for (const { point, strategy } of session.states) {
    if (strategy.finished) labels[point.id] = formatThreshold({ ...strategy.result(), finished: true });
  }
  return labels;
}

const SCREENING_SYMBOLS = { normal: '○', relative: '◧', absolute: '■' };

export const formatThreshold = (p) =>
  p.finished === false
    ? '·'
    : p.screening
      ? SCREENING_SYMBOLS[p.category] ?? '·'
      : p.flag === '<' ? `<${p.threshold}` : p.flag === '>=' ? `≥${p.threshold}` : `${Math.round(p.threshold)}`;

export function toCSV(result) {
  const header = 'punto,x,y,umbral_db,marca,categoria,presentaciones,mancha_ciega,foveal,completo';
  const rows = result.points.map((p) =>
    [
      p.id,
      p.x,
      p.y,
      p.finished ? p.threshold : '',
      p.flag ?? '',
      p.category ?? '',
      p.presentations,
      p.blindSpot ? 1 : 0,
      p.foveal ? 1 : 0,
      p.finished ? 1 : 0,
    ].join(','),
  );
  return [header, ...rows].join('\n');
}
