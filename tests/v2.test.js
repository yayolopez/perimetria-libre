import { test, assert } from './harness.js';
import { PerimetrySession } from '../src/core/procedure.js';
import { SupraThresholdStrategy } from '../src/core/strategies/supraThreshold.js';
import { SimulatedObserver, runSimulation, glaucomaDemoField, normalField, syntheticNormative } from '../src/core/simulator.js';
import { summarize, liveCounters, finishedLabels } from '../src/core/results.js';
import { analyse, buildNormative, normativeMatches } from '../src/core/normative.js';
import { planScreen, maxDistanceMm, recommendedDistanceMm, nearAddDiopters, projectMm } from '../src/core/screenGeometry.js';
import { getPattern } from '../src/core/patterns.js';
import { createRng } from '../src/core/math.js';

const RANGE = { minDb: 16, maxDb: 40 };

let cachedNorm = null;
const norm = () => (cachedNorm ??= syntheticNormative({ patternId: '24-2', range: RANGE, subjects: 80 }));

function simulate({ field, age, eye = 'OD', strategy = 'zest', seed = 5, foveal = false }) {
  const session = new PerimetrySession({ patternId: '24-2', eye, range: RANGE, strategy, seed, foveal });
  runSimulation(session, new SimulatedObserver({ thresholdAt: field, rng: createRng(seed + 1) }));
  return summarize(session, { age, mode: 'simulation', stimulusSizeDeg: 0.431 });
}

test('tamizaje: normal, relativo y absoluto', () => {
  const run = (respond) => {
    const s = new SupraThresholdStrategy({ startDb: 30, ...RANGE });
    while (!s.finished) s.update(s.nextStimulus(), respond(s.nextStimulus()));
    return s.result();
  };
  assert.equal(run(() => true).category, 'normal');
  assert.equal(run((db) => db <= RANGE.minDb).category, 'relative');
  assert.equal(run(() => false).category, 'absolute');
  const s = new SupraThresholdStrategy({ startDb: 30, ...RANGE });
  assert.equal(s.nextStimulus(), 24, 'tamiza 6 dB más brillante que lo esperado');
});

test('umbral foveal: se agrega y se informa aparte', () => {
  const r = simulate({ field: () => 34, age: 50, foveal: true });
  assert.equal(r.points.length, 55);
  assert.ok(r.points.at(-1).foveal);
  assert.ok(r.stats.fovealThreshold !== null, 'hay umbral foveal');
});

test('base normativa sintética: forma y pendiente de edad', () => {
  const n = norm();
  assert.ok(n.synthetic);
  assert.equal(n.points.length, 52, 'excluye la mancha ciega');
  const slope = n.points.reduce((a, p) => a + p.slope, 0) / n.points.length;
  assert.approx(slope, -0.07, 0.04, 'pendiente de edad');
  assert.ok(n.indices && n.indices.mdSd > 0, 'distribución de MD');
});

test('MD y PSD: campo normal cerca de 0, glaucoma claramente anormal', () => {
  const n = norm();
  const normal = analyse(simulate({ field: normalField('OD', 65), age: 65 }), n);
  assert.ok(!normal.error, normal.error);
  assert.approx(normal.md, 0, 1.5, 'MD normal');
  assert.ok(normal.psd < 3, `PSD normal ${normal.psd}`);

  const glauc = analyse(simulate({ field: glaucomaDemoField('OD', 65), age: 65 }), n);
  assert.ok(glauc.md < -3, `MD glaucoma ${glauc.md}`);
  assert.ok(glauc.psd > 5, `PSD glaucoma ${glauc.psd}`);
  assert.equal(glauc.psdP, 0.005, 'PSD p < 0.5 %');
  assert.ok(glauc.rows.filter((r) => r.pdP !== null).length >= 8, 'puntos anormales en desviación patrón');
});

test('normativa: OI se compara con OD reflejado', () => {
  const n = norm();
  const oi = analyse(simulate({ field: normalField('OI', 40), age: 40, eye: 'OI' }), n);
  assert.ok(!oi.error, oi.error);
  assert.approx(oi.md, 0, 1.5, 'MD OI');
});

test('normativa: sin edad o en tamizaje no se calcula', () => {
  const n = norm();
  assert.ok(analyse(simulate({ field: normalField(), age: null }), n).error);
  assert.ok(analyse(simulate({ field: normalField(), age: 50, strategy: 'supra' }), n).error);
});

test('normativa: coincide por patrón, tamaño y dispositivo', () => {
  const r = simulate({ field: normalField(), age: 50 });
  assert.ok(normativeMatches(norm(), r));
  assert.ok(!normativeMatches({ ...norm(), mode: 'xr' }, r));
  assert.throws(() => buildNormative({ id: 'x', name: 'x', results: [r] }), 'pocos sujetos');
});

test('monitor: contadores y etiquetas en vivo', () => {
  const session = new PerimetrySession({ patternId: '10-2', range: RANGE, seed: 3 });
  runSimulation(session, new SimulatedObserver({ rng: createRng(4) }));
  const c = liveCounters(session);
  assert.ok(c.fixation[1] > 0);
  assert.equal(Object.keys(finishedLabels(session)).length, 68);
});

test('pantalla: proyección y distancia recomendada', () => {
  const p = projectMm(45, 0, 400);
  assert.approx(p.x, 400, 1e-6, 'tan(45°)·d');
  const points = getPattern('24-2', 'OD');
  // Monitor de 24" (531 × 299 mm).
  const screen = { screenWmm: 531, screenHmm: 299, points };
  const max = maxDistanceMm(screen);
  assert.ok(max > 300 && max < 420, `distancia máxima ${max}`);
  assert.ok(planScreen({ ...screen, distanceMm: max - 5 }).fits);
  assert.ok(!planScreen({ ...screen, distanceMm: max + 20 }).fits);
  assert.ok(recommendedDistanceMm(screen) <= max);
  // La fijación se corre hacia el lado temporal porque el escalón nasal llega a 27°.
  assert.ok(planScreen({ ...screen, distanceMm: 300 }).fixation.x > 0);
});

test('pantalla: adición de cerca según edad', () => {
  assert.equal(nearAddDiopters(330, 70), 3);
  assert.equal(nearAddDiopters(330, 20), 0);
});
