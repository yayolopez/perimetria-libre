/**
 * Panel del operador: cronómetro, progreso, controles de confiabilidad,
 * mapa en vivo, mirada y botones de control. Se alimenta con los mensajes
 * del runner, ya sea directamente o a través de MonitorHost/MonitorClient.
 */
import { liveFieldSvg, esc } from './report.js';

const STATE_LABEL = {
  waiting: 'Esperando que el paciente presione para comenzar',
  running: 'En curso',
  paused: 'En pausa',
  ended: 'Terminado',
};

const clock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class MonitorView {
  constructor(root, { onCommand, onResult = null }) {
    this.root = root;
    this.onCommand = onCommand;
    this.onResult = onResult;
    this.reset();
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cmd]');
      if (btn) this.onCommand(btn.dataset.cmd);
    });
    this.timer = setInterval(() => this.tickClock(), 500);
  }

  reset() {
    this.hello = null;
    this.state = 'waiting';
    this.elapsedMs = 0;
    this.elapsedAt = performance.now();
    this.labels = {};
    this.counters = null;
    this.progress = null;
    this.currentId = null;
    this.recent = [];
    this.gaze = null;
    this.notice = '';
    this.root.innerHTML = `
      <div class="mon">
        <div class="mon__head">
          <div class="mon__who" data-who>Sin examen activo</div>
          <div class="mon__clock" data-clock>0:00</div>
        </div>
        <div class="mon__state" data-state></div>
        <progress data-progress max="1" value="0"></progress>
        <div class="mon__grid">
          <div class="mon__map" data-map></div>
          <div class="mon__side">
            <table class="mon__counters">
              <tr><th>Pérdidas de fijación</th><td data-c="fixation">—</td></tr>
              <tr><th>Falsos positivos</th><td data-c="falsePositive">—</td></tr>
              <tr><th>Falsos negativos</th><td data-c="falseNegative">—</td></tr>
            </table>
            <div class="mon__recent" data-recent aria-label="Últimas respuestas"></div>
            <div class="mon__gaze" data-gaze></div>
            <div class="mon__notice" data-notice></div>
            <div class="mon__controls">
              <button type="button" class="primary" data-cmd="start">Iniciar</button>
              <button type="button" data-cmd="pause">Pausar</button>
              <button type="button" data-cmd="resume">Reanudar</button>
              <button type="button" class="danger" data-cmd="stop">Detener</button>
            </div>
          </div>
        </div>
      </div>`;
    this.render();
  }

  $(sel) {
    return this.root.querySelector(sel);
  }

  handle(msg) {
    switch (msg.type) {
      case 'hello':
        this.reset();
        this.hello = msg;
        break;
      case 'status':
        this.state = msg.state;
        this.elapsedMs = msg.elapsedMs;
        this.elapsedAt = performance.now();
        break;
      case 'trial':
        this.labels = msg.labels;
        this.counters = msg.counters;
        this.progress = msg.progress;
        this.currentId = msg.pointId;
        this.elapsedMs = msg.elapsedMs;
        this.elapsedAt = performance.now();
        this.recent = [{ kind: msg.kind, seen: msg.seen }, ...this.recent].slice(0, 24);
        break;
      case 'gaze':
        this.gaze = msg.sample;
        break;
      case 'notice':
        this.notice = msg.text;
        break;
      case 'result':
        this.onResult?.(msg.result);
        break;
      default:
        return;
    }
    this.render();
  }

  tickClock() {
    const running = this.state === 'running';
    const ms = this.elapsedMs + (running ? performance.now() - this.elapsedAt : 0);
    const el = this.$('[data-clock]');
    if (el) el.textContent = clock(ms);
  }

  render() {
    const h = this.hello;
    this.$('[data-who]').innerHTML = h
      ? `<b>${esc(h.config.patientId || 'Paciente sin ID')}</b> · ${esc(h.config.eye)} · ${esc(h.config.patternId)} · ${esc(h.config.strategyLabel)}`
      : 'Sin examen activo';
    this.$('[data-state]').textContent = h ? STATE_LABEL[this.state] ?? '' : '';
    this.$('[data-progress]').value = this.progress?.fraction ?? 0;
    this.$('[data-map]').innerHTML = h
      ? liveFieldSvg({ points: h.points.filter((p) => !p.foveal), spacing: h.spacing, labels: this.labels, currentId: this.currentId })
      : '';
    for (const key of ['fixation', 'falsePositive', 'falseNegative']) {
      const c = this.counters?.[key];
      this.$(`[data-c="${key}"]`).textContent = c ? `${c[0]}/${c[1]}` : '—';
    }
    this.$('[data-recent]').innerHTML = this.recent
      .map((r) => `<span class="r r--${r.kind} ${r.seen ? 'r--seen' : ''}" title="${r.kind}${r.seen ? ' · vio' : ' · no vio'}"></span>`)
      .join('');
    const g = this.gaze;
    this.$('[data-gaze]').innerHTML = g
      ? `Mirada: ${g.lost ? '<b class="bad">ojo no detectado</b>' : g.blink ? '<b class="bad">parpadeo</b>' : `${g.deviationDeg.toFixed(1)}°`}${
          g.distanceMm ? ` · distancia ≈ ${Math.round(g.distanceMm / 10)} cm` : ''
        }`
      : '';
    this.$('[data-notice]').textContent = this.notice;
    const show = (cmd, visible) => (this.$(`[data-cmd="${cmd}"]`).hidden = !visible);
    show('start', Boolean(h) && this.state === 'waiting');
    show('pause', this.state === 'running');
    show('resume', this.state === 'paused');
    show('stop', Boolean(h) && this.state !== 'ended');
    this.tickClock();
  }

  destroy() {
    clearInterval(this.timer);
  }
}
