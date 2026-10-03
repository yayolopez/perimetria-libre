import { PATTERNS, getPattern } from '../core/patterns.js';
import { STRATEGIES, PerimetrySession, defaultStartDb } from '../core/procedure.js';
import { Display, STANDARD_BACKGROUND_CDM2 } from '../core/luminance.js';
import { BUILTIN_PROFILES, CALIBRATION_LEVELS, profileFromMeasurements } from '../core/devices.js';
import { summarize, toCSV, VERSION } from '../core/results.js';
import { SimulatedObserver, runSimulation, glaucomaDemoField, syntheticNormative } from '../core/simulator.js';
import { analyse, buildNormative, normativeMatches, modeGroup, expectedFor, MIN_SUBJECTS_RECOMMENDED } from '../core/normative.js';
import { GOLDMANN_SIZES, SPEEDS, DURATIONS_MS, FIXATION_TARGETS, CATCH_PRESETS, DEFAULT_OPTIONS } from '../core/options.js';
import { CARD_WIDTH_MM, CARD_HEIGHT_MM, recommendedDistanceMm, maxDistanceMm, nearAddDiopters, MIN_DISTANCE_MM } from '../core/screenGeometry.js';
import { createRng } from '../core/math.js';
import { runSession, RunControl } from './runner.js';
import { ScreenPerimeterRenderer } from './screen-renderer.js';
import { renderReport, esc } from './report.js';
import { MonitorHost } from './monitor-link.js';
import { MonitorView } from './monitor-view.js';
import { ResponseSound } from './sound.js';
import * as store from './storage.js';
import { TESTS, testById } from './tests/index.js';
import { ScreenCanvasRenderer } from './canvas-renderers.js';
import * as sync from './sync.js';
import { DIAGNOSES, anonymize } from '../core/anonymize.js';

const $ = (sel) => document.querySelector(sel);
const MODE_LABEL = { xr: 'Visor VR', screen: 'Pantalla', simulation: 'Simulación' };

let XRPerimeterRenderer = null;
let XRCanvasRenderer = null;
let currentResult = null;
let currentControl = null;

// El monitor (otra ventana u otro equipo) puede conectarse en cualquier momento.
const host = new MonitorHost({ onCommand: (cmd) => currentControl?.command(cmd) });

// ---------- Navegación ----------
function show(view) {
  document.querySelectorAll('[data-view]').forEach((el) => (el.hidden = el.dataset.view !== view));
  document.querySelectorAll('[data-nav]').forEach((btn) =>
    btn.setAttribute('aria-current', btn.dataset.nav === view ? 'page' : 'false'),
  );
  if (view === 'history') renderHistory();
  if (view === 'calibration') renderProfiles();
  if (view === 'normative') renderNormatives();
  window.scrollTo(0, 0);
}
document.querySelectorAll('[data-nav]').forEach((btn) => btn.addEventListener('click', () => show(btn.dataset.nav)));

// ---------- Formulario ----------
const form = $('#exam-form');
const allProfiles = () => [...BUILTIN_PROFILES, ...store.listProfiles()];

function fillSelect(select, entries, selected) {
  select.innerHTML = entries.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('');
  if (selected !== undefined && entries.some(([v]) => String(v) === String(selected))) select.value = selected;
}

function populateForm() {
  const prefs = { ...DEFAULT_OPTIONS, ...store.loadPrefs() };
  fillSelect(form.pattern, Object.values(PATTERNS).map((p) => [p.id, p.label]), prefs.pattern);
  fillSelect(form.strategy, Object.entries(STRATEGIES).map(([id, s]) => [id, s.label]), prefs.strategy);
  fillSelect(form.profile, allProfiles().map((p) => [p.id, p.name]), prefs.profile);
  fillSelect(form.size, Object.entries(GOLDMANN_SIZES).map(([id, s]) => [id, s.label]), prefs.size);
  fillSelect(form.durationMs, DURATIONS_MS.map((ms) => [ms, `${ms} ms${ms === 200 ? ' (estándar)' : ''}`]), prefs.durationMs);
  fillSelect(form.speed, Object.entries(SPEEDS).map(([id, s]) => [id, s.label]), prefs.speed);
  fillSelect(form.fixation, Object.entries(FIXATION_TARGETS), prefs.fixation);
  fillSelect(form.catchPreset, Object.entries(CATCH_PRESETS).map(([id, c]) => [id, c.label]), prefs.catchPreset);
  form.background.value = prefs.background ?? STANDARD_BACKGROUND_CDM2.toFixed(1);
  form.distanceCm.value = prefs.distanceCm ?? '';
  for (const name of ['foveal', 'sound', 'gaze']) form[name].checked = Boolean(prefs[name]);
  form.remoteMonitor.checked = false;
  document.querySelectorAll('select.diagnosis').forEach((sel) => fillSelect(sel, Object.entries(DIAGNOSES)));
  updateInfo();
}

function readOptions() {
  return {
    size: form.size.value,
    durationMs: Number(form.durationMs.value),
    speed: form.speed.value,
    fixation: form.fixation.value,
    catchPreset: form.catchPreset.value,
    foveal: form.foveal.checked,
    sound: form.sound.checked,
    gaze: form.gaze.checked,
    remoteMonitor: form.remoteMonitor.checked,
  };
}

function readConfig() {
  const profile = allProfiles().find((p) => p.id === form.profile.value) ?? BUILTIN_PROFILES[0];
  const options = readOptions();
  const cfg = {
    patientId: form.patientId.value.trim(),
    age: form.age.value ? Number(form.age.value) : null,
    eye: form.eye.value,
    correction: form.correction.value.trim(),
    notes: form.notes.value.trim(),
    normal: form.normal.checked || form.diagnosis.value === 'normal',
    diagnosis: form.diagnosis.value,
    consent: form.consent.checked,
    patternId: form.pattern.value,
    strategy: form.strategy.value,
    profile,
    backgroundCdm2: Number(form.background.value) || STANDARD_BACKGROUND_CDM2,
    distanceMm: Number(form.distanceCm.value) * 10 || null,
    options,
  };
  const { remoteMonitor, ...persisted } = options;
  // Se combinan con las preferencias existentes (calibración de pantalla, envío de datos…).
  store.savePrefs({
    ...store.loadPrefs(),
    ...persisted,
    pattern: cfg.patternId,
    strategy: cfg.strategy,
    profile: profile.id,
    background: form.background.value,
    distanceCm: form.distanceCm.value,
  });
  return cfg;
}

function updateInfo() {
  updateRangeInfo();
  updateScreenInfo();
}

function updateRangeInfo() {
  const info = $('#range-info');
  try {
    const { profile, backgroundCdm2 } = readConfig();
    const display = new Display(profile, backgroundCdm2);
    const { minDb, maxDb } = display.integerRange();
    info.className = profile.calibrated ? 'hint' : 'hint hint--warn';
    info.textContent =
      `Rango de estímulos: ${minDb}–${maxDb} dB con fondo de ${display.backgroundCdm2.toFixed(1)} cd/m². ` +
      (profile.calibrated ? 'Luminancia calibrada.' : 'Luminancia sin calibrar: los dB son aproximados.');
  } catch (err) {
    info.className = 'hint hint--warn';
    info.textContent = err.message;
  }
}

/** Tamaño de la pantalla completa en mm, si está calibrada. */
function screenMm() {
  const pxPerMm = store.loadPrefs().screenPxPerMm;
  if (!pxPerMm) return null;
  return { pxPerMm, screenWmm: window.screen.width / pxPerMm, screenHmm: window.screen.height / pxPerMm };
}

function updateScreenInfo() {
  const info = $('#screen-info');
  const scr = screenMm();
  if (!scr) {
    info.className = 'hint';
    info.textContent = 'Pantalla sin calibrar: "Iniciar en pantalla" usará un modo de demostración. Calibre en Calibración → Pantalla.';
    return;
  }
  const points = getPattern(form.pattern.value, form.eye.value);
  const max = maxDistanceMm({ ...scr, points });
  const rec = recommendedDistanceMm({ ...scr, points });
  const current = Number(form.distanceCm.value) * 10;
  if (!current || current > max) form.distanceCm.value = Math.round(rec / 10) || '';
  const d = Number(form.distanceCm.value) * 10;
  const age = form.age.value ? Number(form.age.value) : null;
  const size = `${(scr.screenWmm / 10).toFixed(0)} × ${(scr.screenHmm / 10).toFixed(0)} cm`;
  if (max < MIN_DISTANCE_MM) {
    info.className = 'hint hint--warn';
    info.textContent = `Pantalla de ${size}: demasiado chica para el ${form.pattern.value} (habría que sentar al paciente a ${Math.floor(max / 10)} cm). Use un monitor más grande o el patrón 10-2.`;
    return;
  }
  const add = nearAddDiopters(d, age);
  info.className = 'hint';
  info.textContent =
    `Pantalla de ${size}: siente al paciente a ${Math.round(d / 10)} cm del monitor (máximo ${Math.floor(max / 10)} cm para el ${form.pattern.value}). ` +
    `Adición de cerca sugerida: ${add > 0 ? '+' + add.toFixed(2) + ' D' : 'ninguna'}${age ? ` (${age} años)` : ' (indique la edad)'}. Tape el otro ojo.`;
}

form.addEventListener('change', updateInfo);
form.age.addEventListener('input', updateScreenInfo);

form.remoteMonitor.addEventListener('change', async () => {
  const info = $('#remote-info');
  if (!form.remoteMonitor.checked) {
    info.hidden = true;
    return;
  }
  info.hidden = false;
  info.textContent = 'Preparando monitor remoto…';
  try {
    const code = host.code ?? (await host.enableRemote());
    info.innerHTML = `Código del monitor: <b class="code-badge">${code}</b> · En la tablet o PC del operador abra esta misma página → <b>Abrir monitor</b> → escriba el código.`;
  } catch (err) {
    info.textContent = `No se pudo habilitar el monitor remoto: ${err.message ?? err.type}`;
    form.remoteMonitor.checked = false;
  }
});

// ---------- Bases normativas ----------
const syntheticCache = new Map();

function syntheticFor(patternId, range, sizeDeg) {
  const k = `${patternId}|${range.minDb}|${range.maxDb}|${sizeDeg}`;
  if (!syntheticCache.has(k)) {
    syntheticCache.set(k, syntheticNormative({ patternId, range, stimulusSizeDeg: sizeDeg }));
  }
  return syntheticCache.get(k);
}

/** Bases aplicables a un resultado; la sintética solo para simulaciones. */
function normativesFor(result) {
  const list = store.listNormatives().filter((n) => normativeMatches(n, result));
  if (result.meta.mode === 'simulation') {
    list.push(syntheticFor(result.config.patternId, result.config.range, result.meta.stimulusSizeDeg));
  }
  return list;
}

// ---------- Preparar y ejecutar ----------
function prepare(mode) {
  const cfg = readConfig();
  const display = new Display(cfg.profile, cfg.backgroundCdm2);
  const range = display.integerRange();
  const opts = cfg.options;
  const sizeDeg = GOLDMANN_SIZES[opts.size].deg;
  const age = cfg.age ?? (mode === 'simulation' ? 60 : null);

  // Si hay base normativa, el valor esperado para la edad mejora el punto de partida.
  const probe = { config: { patternId: cfg.patternId, range }, meta: { mode, stimulusSizeDeg: sizeDeg } };
  const norm = age ? normativesFor(probe)[0] : null;
  const startDb = norm ? (p) => expectedFor(norm, p, cfg.eye, age) ?? defaultStartDb(p) : defaultStartDb;

  const session = new PerimetrySession({
    patternId: cfg.patternId,
    eye: cfg.eye,
    strategy: cfg.strategy,
    range,
    foveal: opts.foveal,
    catchTrials: CATCH_PRESETS[opts.catchPreset],
    startDb,
  });

  let screen = null;
  if (mode === 'screen') {
    const scr = screenMm();
    screen = scr && cfg.distanceMm
      ? { calibrated: true, pxPerMm: scr.pxPerMm, distanceMm: cfg.distanceMm }
      : { calibrated: false };
  }

  const meta = {
    mode,
    patientId: cfg.patientId,
    age,
    correction: cfg.correction,
    notes: cfg.notes,
    normal: cfg.normal && mode !== 'simulation',
    diagnosis: cfg.diagnosis,
    consent: cfg.consent && mode !== 'simulation',
    profile: { id: cfg.profile.id, name: cfg.profile.name, calibrated: Boolean(cfg.profile.calibrated) },
    backgroundCdm2: display.backgroundCdm2,
    stimulusSizeDeg: sizeDeg,
    options: opts,
    screen,
    userAgent: navigator.userAgent,
  };
  return { cfg, display, session, meta };
}

async function runLive(mode) {
  let prepared;
  try {
    prepared = prepare(mode);
  } catch (err) {
    alert(err.message);
    return;
  }
  const { cfg, display, session, meta } = prepared;
  const opts = cfg.options;

  if (meta.screen?.calibrated) {
    const scr = screenMm();
    const max = maxDistanceMm({ ...scr, points: session.points });
    if (cfg.distanceMm > max) {
      alert(`Con esta pantalla el ${cfg.patternId} solo entra hasta ${Math.floor(max / 10)} cm. Acerque al paciente o cambie de patrón.`);
      return;
    }
  }

  const sound = opts.sound ? new ResponseSound() : null;
  sound?.unlock();
  const renderer =
    mode === 'xr'
      ? new XRPerimeterRenderer({ eye: cfg.eye, display, stimulusSizeDeg: meta.stimulusSizeDeg })
      : new ScreenPerimeterRenderer({
          display,
          stimulusSizeDeg: meta.stimulusSizeDeg,
          geometry: meta.screen?.calibrated ? meta.screen : null,
          points: session.points,
        });

  const control = new RunControl();
  currentControl = control;
  const view = new MonitorView($('#local-monitor'), { onCommand: (cmd) => control.command(cmd) });
  const emit = (msg) => {
    view.handle(msg);
    host.send(msg);
  };
  const badge = $('#remote-code');
  badge.hidden = !host.code;
  badge.textContent = host.code ? `Monitor: ${host.code}` : '';

  show('running');
  emit({
    type: 'hello',
    config: {
      patientId: cfg.patientId,
      eye: cfg.eye,
      patternId: cfg.patternId,
      strategyLabel: STRATEGIES[cfg.strategy].label,
      mode,
    },
    points: session.points.map(({ id, x, y, blindSpot, foveal }) => ({ id, x, y, blindSpot, foveal })),
    spacing: PATTERNS[cfg.patternId].spacing,
  });

  let gaze = null;
  try {
    await renderer.start(); // primero: el visor exige abrir la sesión dentro del clic
    if (mode === 'screen' && opts.gaze) {
      renderer.showMessage('Preparando la cámara…');
      try {
        const { WebcamGazeMonitor } = await import('./gaze.js');
        gaze = new WebcamGazeMonitor({ eye: cfg.eye });
        await gaze.start();
      } catch (err) {
        gaze = null;
        emit({ type: 'notice', text: `Cámara no disponible: ${err.message}. Se sigue sin vigilancia de mirada.` });
      }
    }
    const outcome = await runSession({
      session,
      renderer,
      display,
      timing: { ...SPEEDS[opts.speed], stimulusMs: opts.durationMs },
      fixation: opts.fixation,
      gaze,
      sound,
      control,
      emit,
    });
    meta.timing = outcome.timing;
    meta.completed = outcome.completed;
    meta.elapsedMs = outcome.elapsedMs;
    meta.gaze = outcome.gaze;
  } catch (err) {
    console.error(err);
    alert(`No se pudo completar el examen: ${err.message}`);
  } finally {
    gaze?.stop();
    await renderer.stop();
    currentControl = null;
  }

  view.destroy();
  if (session.log.length === 0) {
    show('new');
    return;
  }
  const result = summarize(session, meta);
  currentResult = store.saveResult(result) ?? result;
  queueForResearch(currentResult);
  host.send({ type: 'result', result: currentResult });
  showReport(currentResult);
}

function runSimulated() {
  let prepared;
  try {
    prepared = prepare('simulation');
  } catch (err) {
    alert(err.message);
    return;
  }
  const { cfg, session, meta } = prepared;
  const observer = new SimulatedObserver({
    thresholdAt: glaucomaDemoField(cfg.eye, meta.age),
    rng: createRng(Date.now()),
  });
  runSimulation(session, observer);
  currentResult = summarize(session, meta);
  showReport(currentResult);
}

$('#start-xr').addEventListener('click', () => runLive('xr'));
$('#start-screen').addEventListener('click', () => runLive('screen'));
$('#start-sim').addEventListener('click', runSimulated);

// ---------- Informe ----------
function showReport(result) {
  const select = $('#report-norm');
  const norms = normativesFor(result);
  select.innerHTML =
    norms.map((n, i) => `<option value="${i}">${esc(n.name)} (n = ${n.n})</option>`).join('') +
    '<option value="none">Ninguna</option>';
  const render = () => {
    const norm = norms[Number(select.value)];
    $('#report').innerHTML = renderReport(result, norm ? analyse(result, norm) : null);
  };
  select.onchange = render;
  render();
  show('report');
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const baseName = (r) =>
  `campo_${(r.meta.patientId || 'anon').replace(/[^\w-]+/g, '_')}_${r.config.eye}_${r.createdAt.slice(0, 10)}`;

$('#export-json').addEventListener('click', () =>
  download(`${baseName(currentResult)}.json`, JSON.stringify(currentResult, null, 2), 'application/json'),
);
$('#export-csv').addEventListener('click', () =>
  download(`${baseName(currentResult)}.csv`, toCSV(currentResult), 'text/csv'),
);
$('#print').addEventListener('click', () => window.print());

// ---------- Historial ----------
function renderHistory() {
  const list = store.listResults();
  $('#history-empty').hidden = list.length > 0;
  $('#history-body').innerHTML = list
    .map((r) => {
      const t = r.kind === 'test' ? testById(r.testId) : null;
      const summary = t ? t.summary(r.data) : r.stats.meanSensitivity === null ? '—' : `MS ${r.stats.meanSensitivity.toFixed(1)} dB`;
      return `<tr>
        <td>${esc(new Date(r.createdAt).toLocaleString('es'))}</td>
        <td>${esc(r.meta.patientId || '—')}</td>
        <td>${esc(r.meta.age ?? '—')}</td>
        <td>${esc(t ? r.meta.eye : r.config.eye)}</td>
        <td>${esc(t ? t.name : `Campimetría ${r.config.patternId}`)}</td>
        <td>${esc(MODE_LABEL[r.meta.mode] ?? r.meta.mode)}</td>
        <td class="summary-cell">${esc(summary)}${r.meta.consent ? (r.meta.uploadedAt ? ' <span title="Enviado a la base de investigación">· ☁ enviado</span>' : ' <span title="En cola para enviar">· ⏳ pendiente</span>') : ''}</td>
        <td>${t ? '' : `<input type="checkbox" data-normal="${esc(r.id)}" ${r.meta.normal ? 'checked' : ''} aria-label="Sujeto normal">`}</td>
        <td class="actions">
          <button type="button" data-open="${esc(r.id)}">Ver</button>
          <button type="button" class="danger" data-delete="${esc(r.id)}">Borrar</button>
        </td></tr>`;
    })
    .join('');
}

$('#history-body').addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  const del = e.target.closest('[data-delete]');
  if (open) {
    const r = store.getResult(open.dataset.open);
    if (r?.kind === 'test') showTestReport(r);
    else if (r) {
      currentResult = r;
      showReport(r);
    }
  } else if (del && confirm('¿Borrar este examen del historial? No se puede deshacer.')) {
    store.deleteResult(del.dataset.delete);
    renderHistory();
  }
});

$('#history-body').addEventListener('change', (e) => {
  const box = e.target.closest('[data-normal]');
  if (box) store.updateResult(box.dataset.normal, { meta: { normal: box.checked } });
});

$('#import-json').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const result = JSON.parse(await file.text());
    if (result.app !== 'perimetria-libre') throw new Error('El archivo no es un examen de Perimetría Libre');
    const saved = store.saveResult(result) ?? result;
    if (saved.kind === 'test') showTestReport(saved);
    else {
      currentResult = saved;
      showReport(saved);
    }
  } catch (err) {
    alert(err.message);
  }
  e.target.value = '';
});

// ---------- Base normativa ----------
const groupKey = (r) => `${r.config.patternId}|${(r.meta.stimulusSizeDeg ?? 0.431).toFixed(3)}|${modeGroup(r.meta.mode)}`;
const sizeName = (deg) => Object.entries(GOLDMANN_SIZES).find(([, s]) => Math.abs(s.deg - deg) < 0.01)?.[0] ?? `${deg}°`;

function normalGroups() {
  const groups = new Map();
  for (const r of store.listResults()) {
    if (r.kind === 'test' || !r.meta.normal || !Number.isFinite(r.meta.age) || r.meta.mode === 'simulation') continue;
    if (r.points.some((p) => p.screening)) continue;
    const k = groupKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return groups;
}

function renderNormatives() {
  const groups = normalGroups();
  $('#norm-groups-empty').hidden = groups.size > 0;
  $('#norm-groups').innerHTML = [...groups.entries()]
    .map(([k, rs]) => {
      const ages = rs.map((r) => r.meta.age);
      const r0 = rs[0];
      return `<tr>
        <td>${esc(r0.config.patternId)}</td>
        <td>Goldmann ${esc(sizeName(r0.meta.stimulusSizeDeg ?? 0.431))}</td>
        <td>${esc(MODE_LABEL[modeGroup(r0.meta.mode)])}</td>
        <td>${rs.length}${rs.length < MIN_SUBJECTS_RECOMMENDED ? ' <span class="muted">(se recomiendan ≥ 60)</span>' : ''}</td>
        <td>${Math.min(...ages)}–${Math.max(...ages)}</td>
        <td><button type="button" class="primary" data-build="${esc(k)}">Construir base</button></td></tr>`;
    })
    .join('');

  const norms = store.listNormatives();
  $('#norms-empty').hidden = norms.length > 0;
  $('#norms-list').innerHTML = norms
    .map(
      (n) => `<li><strong>${esc(n.name)}</strong>
        <span class="muted">${esc(n.patternId)} · Goldmann ${esc(sizeName(n.stimulusSizeDeg))} · ${esc(MODE_LABEL[n.mode] ?? n.mode)} · n = ${n.n} · ${n.ageRange?.join('–') ?? '?'} años</span>
        <span class="row-actions">
          <button type="button" data-export-norm="${esc(n.id)}">Exportar</button>
          <button type="button" class="danger" data-del-norm="${esc(n.id)}">Borrar</button>
        </span></li>`,
    )
    .join('');
}

$('#norm-groups').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-build]');
  if (!btn) return;
  const results = normalGroups().get(btn.dataset.build) ?? [];
  if (results.length < MIN_SUBJECTS_RECOMMENDED &&
      !confirm(`Solo hay ${results.length} sujetos. La base servirá para probar, pero sus límites de probabilidad serán poco confiables. ¿Construir igual?`)) {
    return;
  }
  const r0 = results[0];
  const defaultName = `${r0.config.patternId} · ${MODE_LABEL[modeGroup(r0.meta.mode)]} · ${new Date().toLocaleDateString('es')}`;
  const name = prompt('Nombre de la base normativa', defaultName);
  if (!name) return;
  try {
    const norm = buildNormative({ id: `norm-${Date.now()}`, name, results });
    store.saveNormative(norm);
    renderNormatives();
  } catch (err) {
    alert(err.message);
  }
});

$('#norms-list').addEventListener('click', (e) => {
  const exp = e.target.closest('[data-export-norm]');
  const del = e.target.closest('[data-del-norm]');
  if (exp) {
    const n = store.listNormatives().find((x) => x.id === exp.dataset.exportNorm);
    if (n) download(`base_normativa_${n.patternId}_${n.mode}_${n.n}.json`, JSON.stringify(n, null, 2), 'application/json');
  } else if (del && confirm('¿Borrar esta base normativa?')) {
    store.deleteNormative(del.dataset.delNorm);
    renderNormatives();
  }
});

$('#import-norm').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const norm = JSON.parse(await file.text());
    if (!norm.patternId || !Array.isArray(norm.points) || !norm.mode) {
      throw new Error('El archivo no es una base normativa de Perimetría Libre');
    }
    if (norm.synthetic) throw new Error('Las bases sintéticas no se pueden importar');
    store.saveNormative({ ...norm, id: norm.id ?? `norm-${Date.now()}` });
    renderNormatives();
  } catch (err) {
    alert(err.message);
  }
  e.target.value = '';
});

// ---------- Calibración de pantalla ----------
const slider = $('#card-slider');
const cardBox = $('#card-box');

function updateCardBox() {
  const w = Number(slider.value);
  cardBox.style.width = `${w}px`;
  cardBox.style.height = `${(w * CARD_HEIGHT_MM) / CARD_WIDTH_MM}px`;
  const pxPerMm = w / CARD_WIDTH_MM;
  const wCm = window.screen.width / pxPerMm / 10;
  const hCm = window.screen.height / pxPerMm / 10;
  const diag = Math.hypot(wCm, hCm) / 2.54;
  $('#screen-size').textContent = `Su pantalla mediría ${wCm.toFixed(1)} × ${hCm.toFixed(1)} cm (≈ ${diag.toFixed(1)}″ de diagonal).`;
}
slider.value = Math.round((store.loadPrefs().screenPxPerMm ?? 96 / 25.4) * CARD_WIDTH_MM);
slider.addEventListener('input', updateCardBox);
updateCardBox();

$('#save-screen').addEventListener('click', () => {
  store.savePrefs({ ...store.loadPrefs(), screenPxPerMm: Number(slider.value) / CARD_WIDTH_MM });
  updateScreenInfo();
  $('#screen-size').textContent += ' Calibración guardada.';
});
$('#reset-screen').addEventListener('click', () => {
  const { screenPxPerMm, ...rest } = store.loadPrefs();
  store.savePrefs(rest);
  updateScreenInfo();
  $('#screen-size').textContent = 'Calibración de pantalla borrada.';
});

// ---------- Calibración de luminancia ----------
const calForm = $('#cal-form');
calForm.measurements.value = CALIBRATION_LEVELS.map((l) => `${l}, `).join('\n');

function renderProfiles() {
  const custom = store.listProfiles();
  $('#profiles-empty').hidden = custom.length > 0;
  $('#profiles-list').innerHTML = custom
    .map((p) => {
      let range = '';
      try {
        const r = new Display(p).integerRange();
        range = `${r.minDb}–${r.maxDb} dB`;
      } catch (err) {
        range = err.message;
      }
      return `<li><strong>${esc(p.name)}</strong> <span class="muted">${esc(range)}</span>
        <span class="row-actions"><button type="button" class="danger" data-del-profile="${esc(p.id)}">Borrar</button></span></li>`;
    })
    .join('');
}

$('#profiles-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-del-profile]');
  if (btn && confirm('¿Borrar este perfil de calibración?')) {
    store.deleteProfile(btn.dataset.delProfile);
    renderProfiles();
    populateForm();
  }
});

calForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const measurements = calForm.measurements.value
    .split('\n')
    .map((line) => line.split(/[,;\t ]+/).filter(Boolean).map(Number))
    .filter((pair) => pair.length >= 2);
  const name = calForm.calName.value.trim();
  try {
    const profile = profileFromMeasurements({ id: `cal-${Date.now()}`, name, measurements });
    new Display(profile); // valida monotonía y rango
    store.saveProfile(profile);
    renderProfiles();
    populateForm();
    alert('Perfil guardado. Selecciónelo en "Opciones del examen".');
  } catch (err) {
    alert(err.message);
  }
});

async function showCalibrationLevels(mode) {
  const display = new Display(BUILTIN_PROFILES[0]);
  const renderer = mode === 'xr' ? new XRPerimeterRenderer({ display }) : new ScreenPerimeterRenderer({ display });
  try {
    await renderer.start();
    for (const level of CALIBRATION_LEVELS) {
      renderer.showField(level / 255, `Nivel ${level} · mida y presione para seguir`);
      const t = await renderer.waitForSelect();
      if (t === null) break;
    }
  } catch (err) {
    alert(err.message);
  } finally {
    await renderer.stop();
  }
}
$('#cal-xr').addEventListener('click', () => showCalibrationLevels('xr'));
$('#cal-screen').addEventListener('click', () => showCalibrationLevels('screen'));


// ---------- Otras pruebas ----------
const testForm = $('#test-form');
let selectedTest = null;
let currentTestResult = null;

function renderTestCards() {
  $('#test-cards').innerHTML = TESTS.map(
    (t) => `<button type="button" class="test-card" data-test="${esc(t.id)}">
      <b>${esc(t.name)}</b><span>${esc(t.description)}</span>
      ${t.dichoptic ? '<em>binocular · rojo/verde en pantalla</em>' : ''}</button>`,
  ).join('');
}

$('#test-cards').addEventListener('click', (e) => {
  const card = e.target.closest('[data-test]');
  if (!card) return;
  selectedTest = testById(card.dataset.test);
  document.querySelectorAll('.test-card').forEach((c) => c.setAttribute('aria-pressed', String(c === card)));
  $('#test-title').textContent = selectedTest.name;
  $('#test-desc').textContent = selectedTest.description;
  $('#test-eye-label').textContent = selectedTest.eyeLabel ?? 'Ojo';
  const eyeNames = { OD: 'OD · derecho', OI: 'OI · izquierdo', OU: 'Ambos ojos' };
  fillSelect(testForm.eye, selectedTest.eyes.map((e) => [e, eyeNames[e]]));
  testForm.distanceCm.value = selectedTest.screenDistanceCm;
  if (!testForm.patientId.value) testForm.patientId.value = form.patientId.value;
  if (!testForm.age.value) testForm.age.value = form.age.value;
  testForm.hidden = false;
  updateTestInfo();
  testForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

testForm.addEventListener('change', updateTestInfo);

function testGeometry() {
  const scr = screenMm();
  const distanceMm = Number(testForm.distanceCm.value) * 10;
  return scr && distanceMm ? { pxPerMm: scr.pxPerMm, distanceMm } : null;
}

/** Píxeles físicos por grado en pantalla (calibrada o en modo demostración). */
function screenPxPerDeg(geometry) {
  const dpr = window.devicePixelRatio || 1;
  if (geometry) return geometry.pxPerMm * dpr * geometry.distanceMm * Math.tan(Math.PI / 180);
  return ((Math.min(window.innerWidth, window.innerHeight) * dpr) / 2 / Math.tan((18 * Math.PI) / 180)) * Math.tan(Math.PI / 180);
}

function updateTestInfo() {
  if (!selectedTest) return;
  const geo = testGeometry();
  const ppd = screenPxPerDeg(geo);
  const info = $('#test-info');
  if (!geo) {
    info.className = 'hint hint--warn';
    info.textContent = 'Pantalla sin calibrar: en pantalla la escala será aproximada (Calibración → Pantalla).';
    return;
  }
  let extra = '';
  const scr = screenMm();
  const maxMm = Math.min(scr.screenWmm, scr.screenHmm) / 2 / Math.tan((selectedTest.fieldDeg * Math.PI) / 180);
  if (geo.distanceMm > maxMm) {
    info.className = 'hint hint--warn';
    info.textContent = `Con esta pantalla, la prueba entra completa hasta ${Math.floor(maxMm / 10)} cm. Acerque al paciente.`;
    return;
  }
  if (selectedTest.id === 'acuity') {
    const best = Math.log10(60 / ppd);
    extra = ` A esta distancia la letra más chica posible es logMAR ${best.toFixed(2)} (20/${Math.round(20 * 10 ** best)}).${best > 0 ? ' Aleje al paciente para medir 20/20.' : ''}`;
  }
  info.className = 'hint';
  info.textContent = `Pantalla: ${ppd.toFixed(0)} píxeles por grado a ${testForm.distanceCm.value} cm.${extra}`;
}

function testMeta(mode, pxPerDeg, geometry, completed) {
  return {
    mode,
    patientId: testForm.patientId.value.trim(),
    age: testForm.age.value ? Number(testForm.age.value) : null,
    eye: testForm.eye.value,
    diagnosis: testForm.diagnosis.value,
    consent: testForm.consent.checked && mode !== 'simulation',
    pxPerDeg: Math.round(pxPerDeg * 10) / 10,
    screen: geometry,
    completed,
    userAgent: navigator.userAgent,
  };
}

function makeTestResult(t, meta, data) {
  return { app: 'perimetria-libre', kind: 'test', testId: t.id, version: VERSION, createdAt: new Date().toISOString(), meta, data };
}

async function runOtherTest(mode) {
  const t = selectedTest;
  if (!t) return;
  const eye = testForm.eye.value;
  const geometry = mode === 'screen' ? testGeometry() : null;
  const renderer = mode === 'xr' ? new XRCanvasRenderer({ eye }) : new ScreenCanvasRenderer({ eye, geometry, fieldDeg: t.fieldDeg });
  const profile = allProfiles().find((p) => p.id === store.loadPrefs().profile) ?? BUILTIN_PROFILES[0];
  const display = new Display(profile);
  $('#test-running-title').textContent = t.name;
  $('#test-progress').value = 0;
  show('test-running');

  let session = null;
  let completed = false;
  let pxPerDeg = 20;
  try {
    await renderer.start(t); // primero: el visor exige abrir la sesión dentro del clic
    pxPerDeg = mode === 'xr' ? await renderer.getPxPerDeg() : screenPxPerDeg(geometry);
    session = t.create({ eye, pxPerDeg, rng: createRng(Date.now()), mode, display, screenDistanceM: (geometry?.distanceMm ?? 400) / 1000 });
    completed = await renderer.play(session, { onProgress: (v) => ($('#test-progress').value = v) });
  } catch (err) {
    console.error(err);
    alert(`No se pudo realizar la prueba: ${err.message}`);
  } finally {
    await renderer.stop();
  }
  if (!session || !completed) {
    show('tests');
    return;
  }
  const result = makeTestResult(t, testMeta(mode, pxPerDeg, geometry, true), session.result());
  const saved = store.saveResult(result) ?? result;
  queueForResearch(saved);
  showTestReport(saved);
}

function runSimulatedTest() {
  const t = selectedTest;
  if (!t) return;
  const pxPerDeg = 60;
  const data = t.simulate({ pxPerDeg, rng: createRng(Date.now()), eye: testForm.eye.value });
  showTestReport(makeTestResult(t, testMeta('simulation', pxPerDeg, null, true), data));
}

$('#test-xr').addEventListener('click', () => runOtherTest('xr'));
$('#test-screen').addEventListener('click', () => runOtherTest('screen'));
$('#test-sim').addEventListener('click', runSimulatedTest);

function showTestReport(result) {
  currentTestResult = result;
  const t = testById(result.testId);
  const m = result.meta;
  const date = new Date(result.createdAt);
  const eyeLabel = { OD: 'Derecho', OI: 'Izquierdo', OU: 'Ambos' }[m.eye] ?? m.eye;
  $('#test-report').innerHTML = `
    ${m.mode === 'simulation' ? '<p class="banner banner--sim">SIMULACIÓN · datos ficticios generados por el programa</p>' : ''}
    <h2>${esc(t?.name ?? result.testId)}</h2>
    <header class="report__head">
      <div><span class="k">Paciente</span><span>${esc(m.patientId) || '—'}</span></div>
      <div><span class="k">Edad</span><span>${esc(m.age) || '—'}</span></div>
      <div><span class="k">${esc(t?.eyeLabel ?? 'Ojo')}</span><span>${esc(eyeLabel)}</span></div>
      <div><span class="k">Fecha</span><span>${esc(date.toLocaleString('es'))}</span></div>
      <div><span class="k">Equipo</span><span>${esc(MODE_LABEL[m.mode] ?? m.mode)}${m.screen?.distanceMm ? ` · ${Math.round(m.screen.distanceMm / 10)} cm` : ''}</span></div>
      <div><span class="k">Resolución</span><span>${esc(m.pxPerDeg)} px/°</span></div>
    </header>
    ${t ? t.report(result.data) : '<p>Prueba desconocida en esta versión.</p>'}`;
  show('test-report');
}

$('#test-export').addEventListener('click', () => {
  const r = currentTestResult;
  if (!r) return;
  const name = `${r.testId}_${(r.meta.patientId || 'anon').replace(/[^\w-]+/g, '_')}_${r.createdAt.slice(0, 10)}.json`;
  download(name, JSON.stringify(r, null, 2), 'application/json');
});
$('#test-print').addEventListener('click', () => window.print());

renderTestCards();


// ---------- Recolección de datos ----------
const syncForm = $('#sync-form');

function queueForResearch(result) {
  if (sync.enqueue(result) && sync.syncSettings().auto) flushResearch();
}

async function flushResearch() {
  const r = await sync.flush(testById);
  renderSyncStatus(r.lastError ? `Último error: ${r.lastError}` : r.sent ? `Enviados ${r.sent} exámenes.` : '');
  if (!$('[data-view="history"]').hidden) renderHistory();
  return r;
}

function renderSyncStatus(extra = '') {
  const s = sync.syncSettings();
  const el = $('#sync-status');
  el.className = sync.isConfigured() ? 'hint' : 'hint hint--warn';
  el.textContent = `${sync.isConfigured() ? `Configurado (${s.site || 'sin nombre de consultorio'}).` : 'Sin configurar: los exámenes quedan solo en este equipo.'} Pendientes de enviar: ${sync.pendingCount()}. ${extra}`;
}

function fillSyncForm() {
  const s = sync.syncSettings();
  syncForm.url.value = s.url;
  syncForm.key.value = s.key;
  syncForm.site.value = s.site;
  syncForm.auto.checked = s.auto !== false;
  renderSyncStatus();
}

syncForm.addEventListener('submit', (e) => {
  e.preventDefault();
  sync.saveSyncSettings({
    url: syncForm.url.value.trim(),
    key: syncForm.key.value.trim(),
    site: syncForm.site.value.trim(),
    auto: syncForm.auto.checked,
  });
  renderSyncStatus('Guardado.');
});

$('#sync-test').addEventListener('click', async () => {
  syncForm.requestSubmit();
  renderSyncStatus('Probando…');
  try {
    await sync.testConnection();
    renderSyncStatus('Conexión correcta ✓');
  } catch (err) {
    renderSyncStatus(`No se pudo conectar: ${err.message}`);
  }
});

$('#sync-now').addEventListener('click', () => {
  // Incluye exámenes con consentimiento guardados antes de configurar el envío.
  store.listResults().forEach((r) => sync.enqueue(r));
  renderSyncStatus('Enviando…');
  flushResearch();
});

$('#sync-link').addEventListener('click', async () => {
  const link = sync.configLink(location.href);
  try {
    await navigator.clipboard.writeText(link);
    renderSyncStatus('Enlace copiado. Ábralo en el visor (por ejemplo enviándolo por correo) y quedará configurado.');
  } catch {
    prompt('Copie este enlace y ábralo en el otro equipo:', link);
  }
});

$('#sync-export').addEventListener('click', () => {
  const { site } = sync.syncSettings();
  const records = store.listResults().filter((r) => r.meta.consent && r.meta.mode !== 'simulation').map((r) => anonymize(r, { site }));
  download(`perimetria-libre_anonimizado_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(records, null, 2), 'application/json');
});

window.addEventListener('online', () => sync.isConfigured() && flushResearch());

// El enlace de configuración puede abrirse con la app ya cargada.
window.addEventListener('hashchange', () => {
  if (!sync.applyConfigFromLocation()) return;
  fillSyncForm();
  show('normative');
  renderSyncStatus('Este equipo quedó configurado con el enlace.');
});

// ---------- Arranque ----------
async function detectXR() {
  const status = $('#xr-status');
  const xrButtons = [$('#start-xr'), $('#cal-xr'), $('#test-xr')];
  xrButtons.forEach((b) => (b.disabled = true));
  if (!window.isSecureContext) {
    status.textContent = 'El visor VR necesita HTTPS. Abra la página publicada (https://…) desde el visor.';
    return;
  }
  if (!navigator.xr) {
    status.textContent = 'Este navegador no tiene realidad virtual (WebXR). Para el visor, abra esta página en el navegador del Pico o Quest.';
    return;
  }
  try {
    const mod = await import('./xr-renderer.js');
    if (!(await mod.XRPerimeterRenderer.isSupported())) {
      status.textContent = 'Este dispositivo no admite realidad virtual inmersiva.';
      return;
    }
    XRPerimeterRenderer = mod.XRPerimeterRenderer;
    XRCanvasRenderer = (await import('./xr-canvas-renderer.js')).XRCanvasRenderer;
    xrButtons.forEach((b) => (b.disabled = false));
    status.textContent = 'Visor VR listo.';
  } catch (err) {
    status.textContent = `No se pudo cargar el módulo VR: ${err.message}`;
  }
}

const configured = sync.applyConfigFromLocation();
populateForm();
fillSyncForm();
detectXR();
show(configured ? 'normative' : 'new');
if (configured) renderSyncStatus('Este equipo quedó configurado con el enlace.');
if (sync.isConfigured() && sync.syncSettings().auto) flushResearch();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
