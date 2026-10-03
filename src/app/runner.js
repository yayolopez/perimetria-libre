/**
 * Ejecuta una sesión en tiempo real: intervalos, ventana de respuesta, pausas,
 * vigilancia de la mirada y eventos para el monitor del operador.
 * Funciona con cualquier renderer que exponga present / waitForSelect /
 * showMessage / setFixation / abort y los callbacks onResponse / onPause / onEnd.
 */
import { liveCounters, finishedLabels } from '../core/results.js';

export const DEFAULT_TIMING = {
  stimulusMs: 200, // duración del estímulo (estándar Goldmann III / Humphrey)
  responseWindowMs: 1500,
  minResponseMs: 150, // respuestas más rápidas se consideran anticipadas
  isiMinMs: 400,
  isiMaxMs: 1000,
};

export const MESSAGES = {
  start: 'Mire siempre el punto central.\nPresione el gatillo cada vez que vea una luz.\nPresione el gatillo para comenzar.',
  gazeCalibration: 'Mire fijo el punto central…',
  pause: 'Pausa\nPresione el botón lateral para continuar.',
  done: 'Examen terminado.\nYa puede quitarse el visor.',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Estado compartido entre el runner, el visor y el monitor del operador. */
export class RunControl {
  constructor() {
    this.paused = false;
    this.stopped = false;
    this.pauseCount = 0;
    this.onChange = () => {};
    this.startRequest = new Promise((resolve) => (this.requestStart = resolve));
  }

  pause() {
    if (this.paused || this.stopped) return;
    this.paused = true;
    this.pauseCount++;
    this.onChange();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.onChange();
  }

  togglePause() {
    if (this.paused) this.resume();
    else this.pause();
  }

  stop() {
    this.stopped = true;
    this.onChange();
  }

  /** Comando del monitor: start, pause, resume, stop. */
  command(cmd) {
    if (cmd === 'start') this.requestStart();
    else if (cmd === 'pause') this.pause();
    else if (cmd === 'resume') this.resume();
    else if (cmd === 'stop') this.stop();
  }
}

export async function runSession({
  session,
  renderer,
  display,
  timing = {},
  fixation = 'dot',
  gaze = null,
  sound = null,
  control = new RunControl(),
  emit = () => {},
}) {
  const t = { ...DEFAULT_TIMING, ...timing };
  const msg = { ...MESSAGES, ...renderer.messages };
  const gazeLog = { trace: [], rejected: 0, calibrated: false };
  let responseWindow = null;
  let startedAt = null;
  let pausedMs = 0;
  let pausedSince = null;

  const elapsed = () =>
    startedAt === null ? 0 : performance.now() - startedAt - pausedMs - (pausedSince ? performance.now() - pausedSince : 0);
  const status = (state) => emit({ type: 'status', state, elapsedMs: elapsed() });

  control.onChange = () => {
    if (control.stopped) {
      renderer.abort();
      return;
    }
    if (control.paused && pausedSince === null) pausedSince = performance.now();
    if (!control.paused && pausedSince !== null) {
      pausedMs += performance.now() - pausedSince;
      pausedSince = null;
    }
    renderer.showMessage(control.paused ? msg.pause : null);
    status(control.paused ? 'paused' : 'running');
  };

  renderer.onResponse = (time) => {
    sound?.click();
    if (responseWindow?.onset != null) {
      const dt = time - responseWindow.onset;
      if (dt >= 0 && dt < t.minResponseMs) return;
      if (dt >= t.minResponseMs && responseWindow.rt === null) {
        responseWindow.rt = dt;
        return;
      }
    }
    session.recordOutOfWindowResponse();
  };
  renderer.onPause = () => control.togglePause();
  renderer.onHidden = () => control.pause();
  renderer.onEnd = () => {
    control.stopped = true;
  };

  renderer.setFixation(fixation);
  renderer.showMessage(msg.start);
  status('waiting');
  await Promise.race([renderer.waitForSelect(), control.startRequest]);
  renderer.cancelWait?.();
  if (control.stopped) return finish(false);

  if (gaze) {
    renderer.showMessage(msg.gazeCalibration);
    gazeLog.calibrated = await gaze.calibrate();
    emit({ type: 'notice', text: gazeLog.calibrated ? 'Mirada calibrada' : 'No se detectó el ojo: la vigilancia de mirada queda inactiva' });
  }
  renderer.showMessage(null);
  startedAt = performance.now();
  status('running');

  let notReadyShown = false;
  while (!control.stopped) {
    if (control.paused) {
      await sleep(100);
      continue;
    }
    if (renderer.isReady && !renderer.isReady()) {
      if (!notReadyShown) renderer.showMessage(renderer.notReadyMessage?.() ?? 'Pantalla demasiado pequeña');
      notReadyShown = true;
      await sleep(300);
      continue;
    }
    if (notReadyShown) {
      renderer.showMessage(null);
      notReadyShown = false;
    }

    const trial = session.nextTrial();
    if (!trial) break;
    const epoch = control.pauseCount;
    renderer.setFixation(trial.foveal ? 'diamond' : fixation);

    await sleep(t.isiMinMs + Math.random() * (t.isiMaxMs - t.isiMinMs));
    if (control.stopped || control.paused || epoch !== control.pauseCount) {
      session.cancelTrial();
      continue;
    }

    const stim = trial.db === null ? null : display.stimulus(trial.db);
    responseWindow = { onset: null, rt: null };
    if (stim) {
      const onset = await renderer.present({ x: trial.x, y: trial.y, value: stim.value }, t.stimulusMs);
      if (onset === null) {
        session.cancelTrial();
        continue;
      }
      responseWindow.onset = onset;
    } else {
      responseWindow.onset = performance.now();
    }
    const g = gaze && gazeLog.calibrated && stim ? gaze.sample() : null;

    await sleep(Math.max(0, responseWindow.onset + t.responseWindowMs - performance.now()));
    const { rt } = responseWindow;
    responseWindow = null;

    if (control.stopped || epoch !== control.pauseCount) {
      session.cancelTrial();
      continue;
    }
    if (g) {
      gazeLog.trace.push({ dev: g.deviationDeg, blink: g.blink, lost: g.lost });
      emit({ type: 'gaze', sample: g });
      if (!g.ok) {
        // Estímulo presentado sin fijación válida: se descarta y se repite más adelante.
        gazeLog.rejected++;
        session.cancelTrial();
        continue;
      }
    }

    session.recordResponse(trial, {
      seen: rt !== null,
      responseTimeMs: rt,
      realizedDb: stim?.realizedDb ?? null,
    });
    emit({
      type: 'trial',
      kind: trial.kind,
      pointId: trial.pointId ?? null,
      x: trial.x,
      y: trial.y,
      db: trial.db,
      seen: rt !== null,
      rt,
      progress: session.progress(),
      counters: liveCounters(session),
      labels: finishedLabels(session),
      elapsedMs: elapsed(),
    });
  }
  return finish(true);

  async function finish(started) {
    const completed = session.isComplete;
    if (started && !control.stopped) {
      renderer.showMessage(msg.done);
      await sleep(2000);
    }
    status('ended');
    return { completed, timing: t, gaze: gaze ? gazeLog : null, elapsedMs: elapsed() };
  }
}
