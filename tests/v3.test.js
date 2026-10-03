import { test, assert } from './harness.js';
import { createRng } from '../src/core/math.js';
import { AcuityTest, logMARtoSnellen, minLogMAR, DIRECTIONS } from '../src/core/tests/acuity.js';
import { ContrastSensitivityTest, usableFrequencies } from '../src/core/tests/contrast.js';
import { StereoTest } from '../src/core/tests/stereo.js';
import { ColorTest, coneIsolating, maxConeContrast, DEFAULT_BACKGROUND, interpretColor } from '../src/core/tests/color.js';
import { AmslerTest } from '../src/core/tests/amsler.js';
import { PhoriaTest, interpretPhoria, degToPrismDiopters } from '../src/core/tests/phoria.js';
import { HessTest } from '../src/core/tests/hess.js';

// Observador simulado para elección forzada: logística en la escala del estímulo.
function afc(rng, guess, slope = 0.05) {
  return (x, t) => rng() < guess + (1 - guess - 0.02) / (1 + Math.exp(-(x - t) / slope));
}
const other = (dir, rng) => DIRECTIONS.filter((d) => d !== dir)[Math.floor(rng() * 3)];

test('agudeza: converge a la logMAR real y respeta el límite del equipo', () => {
  const rng = createRng(1);
  const see = afc(rng, 0.25, 0.04);
  let err = 0;
  for (const truth of [0.0, 0.2, 0.5, 0.8]) {
    const t = new AcuityTest({ pxPerDeg: 120, rng });
    while (!t.finished) {
      const trial = t.nextTrial();
      t.respond(trial, see(trial.logMAR, truth) ? trial.dir : other(trial.dir, rng));
    }
    err += Math.abs(t.result().logMAR - truth);
  }
  assert.ok(err / 4 < 0.1, `error medio ${err / 4}`);
  assert.equal(logMARtoSnellen(0.3), '20/40');
  assert.approx(minLogMAR(20), Math.log10(3), 1e-9, 'visor de 20 px/°');
  const vr = new AcuityTest({ pxPerDeg: 20, rng });
  while (!vr.finished) {
    const trial = vr.nextTrial();
    vr.respond(trial, trial.dir); // paciente que lo ve todo
  }
  assert.ok(vr.result().atLimit, 'marca que alcanzó el límite del visor');
});

test('contraste: frecuencias según resolución y estimación por frecuencia', () => {
  assert.equal(usableFrequencies(20).join(','), '1.5,3');
  const rng = createRng(2);
  const see = afc(rng, 0.5, 0.08);
  const truth = { 1.5: 1.6, 3: 1.9, 6: 1.7, 12: 1.2, 18: 0.7 };
  const t = new ContrastSensitivityTest({ pxPerDeg: 80, rng });
  while (!t.finished) {
    const trial = t.nextTrial();
    const correct = see(trial.logContrast, -truth[trial.cpd]);
    t.respond(trial, correct ? trial.side : trial.side === 'left' ? 'right' : 'left');
  }
  // Con 2 alternativas cada frecuencia tiene bastante ruido: se exige el error medio
  // y que ninguna frecuencia se aleje demasiado.
  const errs = t.result().frequencies.map((f) => Math.abs(f.logCS - truth[f.cpd]));
  assert.ok(errs.reduce((a, b) => a + b, 0) / errs.length < 0.15, `error medio ${errs}`);
  assert.ok(Math.max(...errs) < 0.4, `error máximo ${errs}`);
});

test('estereopsis: umbral y ausencia de estereopsis', () => {
  const rng = createRng(3);
  const see = afc(rng, 0.25, 0.08);
  const run = (truthArcsec) => {
    const t = new StereoTest({ pxPerDeg: 60, rng });
    while (!t.finished) {
      const trial = t.nextTrial();
      t.respond(trial, see(trial.logArcsec, Math.log10(truthArcsec)) ? trial.location : other(trial.location, rng));
    }
    return t.result();
  };
  assert.approx(Math.log10(run(100).arcsec), 2, 0.2, '100"');
  assert.ok(run(1e5).noStereo, 'sin estereopsis');
});

test('color: el estímulo aísla un solo tipo de cono', () => {
  const bg = DEFAULT_BACKGROUND;
  for (const axis of ['protan', 'deutan', 'tritan']) {
    const c = coneIsolating(bg, axis, 0.1);
    assert.ok(c.every((v) => v >= 0 && v <= 1), `${axis} en gama`);
    assert.ok(maxConeContrast(bg, axis) > 0.05, `${axis} contraste máximo`);
  }
  // El cambio de luminancia (Y) de un estímulo S puro es casi nulo.
  const s = coneIsolating(bg, 'tritan', 0.5);
  const Y = (v) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  assert.approx(Y(s), Y(bg), 0.01, 'tritan sin cambio de luminancia');
});

test('color: detecta un defecto deutan simulado', () => {
  const rng = createRng(4);
  const see = afc(rng, 0.25, 0.07);
  const truth = { protan: -2.0, deutan: -0.9, tritan: -1.3 };
  const t = new ColorTest({ rng });
  while (!t.finished) {
    const trial = t.nextTrial();
    t.respond(trial, see(trial.logContrast, truth[trial.axis]) ? trial.gap : other(trial.gap, rng));
  }
  const r = t.result();
  assert.ok(r.interpretation.includes('deutan'), r.interpretation);
  assert.ok(interpretColor({ protan: { logContrast: -2 }, deutan: { logContrast: -2 }, tritan: { logContrast: -1 } }).startsWith('Sin'));
});

test('Amsler: coordenadas y cuadrantes según el ojo', () => {
  const c = AmslerTest.cellCenter(14, 3);
  const back = AmslerTest.cellAt(c.x, c.y);
  assert.equal(`${back.i},${back.j}`, '14,3');
  assert.equal(AmslerTest.cellAt(30, 0), null);
  const od = new AmslerTest({ eye: 'OD' });
  od.toggle(14, 3, 'missing'); // arriba a la derecha = temporal superior en OD
  assert.equal(od.result().quadrants['superior temporal'], 1);
  const oi = new AmslerTest({ eye: 'OI' });
  oi.toggle(14, 3, 'missing');
  assert.equal(oi.result().quadrants['superior nasal'], 1);
  od.toggle(14, 3, 'missing');
  assert.ok(od.result().normal, 'marcar de nuevo borra');
});

test('foria: dioptrías prismáticas y tipo según ojo y dirección', () => {
  assert.approx(degToPrismDiopters(1), 1.745, 0.001);
  assert.equal(interpretPhoria({ direction: 'horizontal', offsetDeg: 2, lineEye: 'OD' }).type, 'Exoforia');
  assert.equal(interpretPhoria({ direction: 'horizontal', offsetDeg: 2, lineEye: 'OI' }).type, 'Endoforia');
  assert.equal(interpretPhoria({ direction: 'vertical', offsetDeg: 1, lineEye: 'OD' }).type, 'Hiperforia derecha');
  assert.equal(interpretPhoria({ direction: 'vertical', offsetDeg: -1, lineEye: 'OD' }).type, 'Hiperforia izquierda');
  assert.equal(interpretPhoria({ direction: 'vertical', offsetDeg: 0.2, lineEye: 'OD' }).type, 'Ortoforia');

  const t = new PhoriaTest({ lineEye: 'OD', rng: createRng(5) });
  while (!t.finished) {
    // Paciente con 4 Δ de exoforia de lejos: alinea la línea 2.29° hacia temporal.
    t.move(-t.offsetDeg + (t.current.direction === 'horizontal' ? 2.29 : 0));
    t.confirm();
  }
  const h = t.result().measurements.find((m) => m.distanceName === 'lejos' && m.direction === 'horizontal');
  assert.equal(h.type, 'Exoforia');
  assert.approx(h.pd, 4, 0.5);
});

test('Hess: desviaciones del ojo no fijador', () => {
  const t = new HessTest({ rng: createRng(6) });
  while (!t.finished) {
    const s = t.current;
    // El ojo izquierdo se queda 2° corto en la mirada a la derecha (paresia).
    const short = s.fixingEye === 'OD' && s.x > 0 ? -2 : 0;
    t.move(s.x + short - t.cursor.x, s.y - t.cursor.y);
    t.confirm();
  }
  const r = t.result();
  assert.equal(r.leftEye.length, 9);
  assert.approx(r.primaryLeftPd, 0, 1e-6);
  assert.approx(r.maxLeftPd, degToPrismDiopters(2), 0.01);
  assert.approx(r.maxRightPd, 0, 1e-6);
});
