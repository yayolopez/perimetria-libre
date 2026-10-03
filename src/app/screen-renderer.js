/**
 * Presentación en un monitor, tablet o celular.
 *
 * Con la pantalla calibrada (píxeles por milímetro) y una distancia de examen,
 * los estímulos se ubican con proyección plana y la fijación se desplaza para
 * que entre todo el patrón. Sin calibración, el campo se ajusta a la pantalla
 * en modo demostración (escala aproximada).
 */
import { TimedPresenter } from './timed-presenter.js';
import { planScreen, projectMm, stimulusRadiusMm, maxDistanceMm } from '../core/screenGeometry.js';

const gray = (value) => {
  const c = Math.round(value * 255);
  return `rgb(${c},${c},${c})`;
};

export class ScreenPerimeterRenderer {
  /**
   * @param geometry { pxPerMm, distanceMm } en píxeles CSS, o null para modo demostración.
   * @param points   puntos del patrón (para ubicar la fijación).
   */
  constructor({ display, stimulusSizeDeg = 0.43, geometry = null, points = [] }) {
    this.display = display;
    this.stimulusSizeDeg = stimulusSizeDeg;
    this.geometry = geometry;
    this.points = points;
    this.presenter = new TimedPresenter();
    this.background = display.backgroundValue;
    this.fixationType = 'dot';
    this.selectResolver = null;
    this.ended = false;
    this.plan = null;
    this.messages = {
      start: 'Tape el otro ojo y mire siempre el punto central.\nPresione la barra espaciadora cada vez que vea una luz.\nPresione la barra espaciadora para comenzar.',
      pause: 'Pausa\nPresione P para continuar.',
      done: 'Examen terminado.',
    };
    this.onResponse = null;
    this.onPause = null;
    this.onEnd = null;
  }

  async start() {
    const overlay = document.createElement('div');
    overlay.className = 'screen-test';
    overlay.innerHTML = '<canvas></canvas><div class="screen-test__msg" hidden></div>';
    document.body.appendChild(overlay);
    this.overlay = overlay;
    this.canvas = overlay.querySelector('canvas');
    this.msg = overlay.querySelector('.screen-test__msg');
    this.ctx = this.canvas.getContext('2d');

    this.onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!e.repeat) this.handleSelect(performance.now());
      } else if (e.code === 'KeyP') {
        this.onPause?.();
      } else if (e.code === 'Escape') {
        this.abort();
        this.onEnd?.();
      }
    };
    this.onPointer = (e) => {
      e.preventDefault();
      this.handleSelect(performance.now());
    };
    // Si la ventana del examen queda oculta, el navegador deja de dibujar: se pausa.
    this.onVisibility = () => {
      if (document.hidden) this.onHidden?.();
    };
    window.addEventListener('keydown', this.onKey);
    document.addEventListener('visibilitychange', this.onVisibility);
    overlay.addEventListener('pointerdown', this.onPointer);

    // No se espera: en algunos navegadores la promesa nunca se resuelve.
    overlay.requestFullscreen?.()?.catch(() => {});
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  /** Recalcula la escala y la ubicación de la fijación para el tamaño actual. */
  layout(wCss, hCss) {
    if (this.geometry) {
      const { pxPerMm, distanceMm } = this.geometry;
      const screen = { screenWmm: wCss / pxPerMm, screenHmm: hCss / pxPerMm, points: this.points };
      const plan = planScreen({ ...screen, distanceMm });
      this.plan = { ...plan, pxPerMm, distanceMm, maxDistanceMm: plan.fits ? null : maxDistanceMm(screen) };
    } else {
      // Demostración: la mitad menor de la pantalla equivale a la excentricidad máxima.
      const extent = Math.max(30, ...this.points.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)))) + 2;
      this.plan = { fits: true, demo: true, pxPerDeg: Math.min(wCss, hCss) / 2 / extent, fixation: { x: 0, y: 0 } };
    }
  }

  /** Posición (px CSS desde el centro) y radio de un punto del campo. */
  toScreen(xDeg, yDeg, sizeDeg) {
    const plan = this.plan;
    if (plan.demo) {
      return { x: xDeg * plan.pxPerDeg, y: -yDeg * plan.pxPerDeg, r: (sizeDeg / 2) * plan.pxPerDeg };
    }
    const mm = projectMm(xDeg, yDeg, plan.distanceMm);
    return {
      x: (plan.fixation.x + mm.x) * plan.pxPerMm,
      y: (plan.fixation.y - mm.y) * plan.pxPerMm,
      r: stimulusRadiusMm(sizeDeg, xDeg, yDeg, plan.distanceMm) * plan.pxPerMm,
    };
  }

  isReady() {
    return Boolean(this.plan?.fits);
  }

  notReadyMessage() {
    const max = this.plan?.maxDistanceMm;
    return max
      ? `La pantalla es chica para esta distancia.\nUse pantalla completa o acerque al paciente a ${Math.floor(max / 10)} cm.`
      : 'La pantalla es demasiado chica para este patrón.';
  }

  frame(time) {
    if (this.ended) return;
    const dpr = window.devicePixelRatio || 1;
    const wCss = this.canvas.clientWidth;
    const hCss = this.canvas.clientHeight;
    const w = Math.round(wCss * dpr);
    const h = Math.round(hCss * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h || !this.plan) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.layout(wCss, hCss);
    }
    const { ctx } = this;
    ctx.setTransform(dpr, 0, 0, dpr, wCss * dpr / 2, hCss * dpr / 2);
    ctx.fillStyle = gray(this.background);
    ctx.fillRect(-wCss / 2, -hCss / 2, wCss, hCss);

    const stim = this.presenter.tick(time);
    if (this.plan.fits) {
      this.drawFixation();
      if (stim) {
        const p = this.toScreen(stim.x, stim.y, this.stimulusSizeDeg);
        ctx.fillStyle = gray(stim.value);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, p.r), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  drawFixation() {
    if (!this.fixationType) return;
    const { ctx } = this;
    ctx.fillStyle = gray(this.background * 0.25);
    const dot = (x, y) => {
      const p = this.toScreen(x, y, 0.3);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, p.r), 0, Math.PI * 2);
      ctx.fill();
    };
    if (this.fixationType === 'dot') dot(0, 0);
    if (this.fixationType === 'diamond') [[2, 0], [-2, 0], [0, 2], [0, -2]].forEach(([x, y]) => dot(x, y));
    if (this.fixationType === 'cross') {
      const c = this.toScreen(0, 0, 0);
      const half = Math.abs(this.toScreen(0.75, 0, 0).x - c.x);
      const t = Math.max(1.5, half / 6);
      ctx.fillRect(c.x - half, c.y - t / 2, half * 2, t);
      ctx.fillRect(c.x - t / 2, c.y - half, t, half * 2);
    }
  }

  setFixation(type) {
    this.fixationType = type;
  }

  handleSelect(time) {
    if (this.selectResolver) {
      const resolve = this.selectResolver;
      this.selectResolver = null;
      resolve(time);
    } else {
      this.onResponse?.(time);
    }
  }

  abort() {
    if (this.ended) return;
    this.ended = true;
    this.presenter.cancel();
    this.selectResolver?.(null);
    this.selectResolver = null;
  }

  cancelWait() {
    this.selectResolver = null;
  }

  present(stimulus, durationMs) {
    if (this.ended) return Promise.resolve(null);
    return this.presenter.present(stimulus, durationMs);
  }

  waitForSelect() {
    if (this.ended) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.selectResolver = resolve;
    });
  }

  showMessage(text) {
    this.msg.hidden = !text;
    this.msg.textContent = text ?? '';
  }

  showField(value, text) {
    this.fixationType = null;
    this.background = value;
    this.showMessage(text);
  }

  async stop() {
    this.abort();
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    this.overlay?.remove();
  }
}
