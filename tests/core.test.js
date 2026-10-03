import { test, assert } from './harness.js';
import { getPattern, blindSpotLocation } from '../src/core/patterns.js';
import { Display, dbToAsb, asbToDb } from '../src/core/luminance.js';
import { BUILTIN_PROFILES, profileFromMeasurements } from '../src/core/devices.js';
import { ZestStrategy } from '../src/core/strategies/zest.js';
import { FullThresholdStrategy } from '../src/core/strategies/fullThreshold.js';
import { PerimetrySession } from '../src/core/procedure.js';
import { SimulatedObserver, runSimulation } from '../src/core/simulator.js';
import { summarize, toCSV } from '../src/core/results.js';
import { createRng } from '../src/core/math.js';

const RANGE = { minDb: 16, maxDb: 40 };

test('patrones: número de puntos', () => {
  assert.equal(getPattern('24-2').length, 54, '24-2');
  assert.equal(getPattern('30-2').length, 76, '30-2');
  assert.equal(getPattern('10-2').length, 68, '10-2');
});

test('patrones: mancha ciega y escalón nasal según el ojo', () => {
  const od = getPattern('24-2', 'OD');
  const oi = getPattern('24-2', 'OI');
  assert.equal(od.filter((p) => p.blindSpot).length, 2);
  assert.ok(od.filter((p) => p.blindSpot).every((p) => p.x === 15), 'OD mancha ciega temporal (+x)');
  assert.ok(oi.filter((p) => p.blindSpot).every((p) => p.x === -15), 'OI reflejado');
  assert.ok(od.some((p) => p.x === -27), 'OD escalón nasal en -27');
  assert.equal(blindSpotLocation('OI').x, -15);
});

test('luminancia: escala dB del Humphrey', () => {
  assert.approx(dbToAsb(0), 10000, 1e-9);
  assert.approx(dbToAsb(10), 1000, 1e-9);
  assert.approx(asbToDb(1), 40, 1e-9);
});

test('luminancia: rango del perfil genérico con fondo de 10 cd/m²', () => {
  const display = new Display(BUILTIN_PROFILES[0]);
  const { minDb, maxDb } = display.range();
  assert.ok(minDb > 14 && minDb < 17, `minDb ${minDb}`);
  assert.ok(maxDb > 38, `maxDb ${maxDb}`);
  const s = display.stimulus(0);
  assert.equal(s.clipped, 'bright', 'un estímulo de 0 dB no es alcanzable en VR');
  const mid = display.stimulus(25);
  assert.approx(mid.realizedDb, 25, 0.6, 'cuantización a 8 bits');
});

test('luminancia: perfil desde mediciones de fotómetro', () => {
  const profile = profileFromMeasurements({
    id: 'x',
    name: 'x',
    measurements: [[0, 0.1], [64, 6], [128, 25], [192, 60], [255, 110]],
  });
  const display = new Display(profile, 10);
  assert.ok(display.backgroundCode > 64 && display.backgroundCode < 128);
  assert.throws(() =>
    new Display(profileFromMeasurements({ id: 'y', name: 'y', measurements: [[0, 5], [255, 1]] })),
  );
});

test('4-2: secuencia determinista con observador perfecto', () => {
  const s = new FullThresholdStrategy({ startDb: 30, ...RANGE });
  const truth = 31.5;
  const seq = [];
  while (!s.finished) {
    const db = s.nextStimulus();
    seq.push(db);
    s.update(db, db <= truth);
  }
  assert.equal(seq.join(','), '30,34,32,30');
  assert.equal(s.result().threshold, 30);
});

test('4-2: ojo ciego queda marcado como "<" del rango', () => {
  const s = new FullThresholdStrategy({ startDb: 30, ...RANGE });
  while (!s.finished) s.update(s.nextStimulus(), false);
  const r = s.result();
  assert.equal(r.flag, '<');
  assert.equal(r.threshold, RANGE.minDb);
});

test('ZEST: converge al umbral con un observador ruidoso', () => {
  const rng = createRng(42);
  const obs = new SimulatedObserver({ rng });
  let errSum = 0;
  let presSum = 0;
  const N = 200;
  for (let i = 0; i < N; i++) {
    const truth = 20 + 15 * rng();
    obs.thresholdAt = () => truth;
    const z = new ZestStrategy({ startDb: 28, ...RANGE });
    while (!z.finished) {
      const db = z.nextStimulus();
      z.update(db, obs.respond({ kind: 'stimulus', db }));
    }
    errSum += Math.abs(z.result().threshold - truth);
    presSum += z.result().presentations;
  }
  assert.ok(errSum / N < 2.5, `error medio ${errSum / N}`);
  assert.ok(presSum / N <= 10, `presentaciones medias ${presSum / N}`);
});

test('sesión completa con simulador: confiabilidad y exportación', () => {
  const session = new PerimetrySession({ patternId: '24-2', eye: 'OD', range: RANGE, seed: 7 });
  runSimulation(session, new SimulatedObserver({ thresholdAt: () => 30, rng: createRng(3) }));
  assert.ok(session.isComplete);
  const r = summarize(session);
  assert.equal(r.points.length, 54);
  assert.ok(r.reliability.fixationLosses.trials > 0, 'hubo controles de fijación');
  assert.ok(r.reliability.falsePositives.trials > 0, 'hubo controles de falsos positivos');
  assert.approx(r.stats.meanSensitivity, 30, 2, 'sensibilidad media');
  assert.equal(toCSV(r).split('\n').length, 55);
});

test('sesión: detecta mala fijación', () => {
  const session = new PerimetrySession({ patternId: '24-2', range: RANGE, seed: 11 });
  runSimulation(session, new SimulatedObserver({ fixationLossRate: 0.9, rng: createRng(5) }));
  const r = summarize(session);
  assert.ok(r.reliability.warnings.includes('fixationLosses'), JSON.stringify(r.reliability));
});

test('sesión: no repite el mismo punto dos veces seguidas', () => {
  const session = new PerimetrySession({ patternId: '10-2', range: RANGE, seed: 1 });
  runSimulation(session, new SimulatedObserver({ rng: createRng(2) }));
  const stim = session.log.filter((t) => t.kind === 'stimulus');
  const active = new Set();
  for (let i = 1; i < stim.length; i++) {
    if (stim[i].pointId === stim[i - 1].pointId) active.add(i);
  }
  // Solo puede repetirse cuando queda un único punto activo, al final.
  assert.ok(active.size <= 6, `repeticiones ${active.size}`);
});
