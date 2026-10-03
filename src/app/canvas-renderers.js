/**
 * Renderer de pantalla para las pruebas dibujadas en lienzo (con anaglifo
 * rojo/verde para las pruebas dicópticas) y la lógica común con el visor
 * (ver xr-canvas-renderer.js).
 *
 * Una "sesión de prueba" expone:
 *   instructions, background, dichoptic, textureSize,
 *   draw(c), onInput(evt) → bool, tick(dt, stick) → bool,
 *   finished, progress(), result()
 * Eventos de entrada: {type:'dir', dir}, {type:'select'}, {type:'alt'},
 * {type:'finish'}, {type:'pointer', x, y} (grados).
 */
import { makeDrawContext, drawMessage } from './canvas-stage.js';

const DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Lógica común: instrucciones, espera de inicio, bucle hasta terminar. */
export class BaseCanvasRenderer {
  constructor({ eye = 'OU' }) {
    this.testedEye = eye;
    this.session = null;
    this.message = null;
    this.dirty = true;
    this.ended = false;
    this.started = false;
    this.waiters = [];
    this.onProgress = null;
  }

  emit(evt) {
    if (this.ended) return;
    if (!this.started) {
      if (evt.type === 'select') {
        this.started = true;
        this.message = null;
        this.dirty = true;
      }
      return;
    }
    if (this.session?.onInput(evt)) this.dirty = true;
  }

  step(dt, stick) {
    const s = this.session;
    if (s && this.started && !this.ended) {
      if (s.tick?.(dt, stick)) this.dirty = true;
      if (s.finished) this.resolveWaiters();
    }
  }

  resolveWaiters() {
    this.waiters.forEach((w) => w());
    this.waiters = [];
  }

  /** Corre la sesión completa; devuelve true si terminó y false si se interrumpió. */
  async play(session, { onProgress } = {}) {
    this.session = session;
    this.message = session.instructions;
    this.dirty = true;
    this.onProgress = onProgress;
    const progressTimer = setInterval(() => onProgress?.(session.progress()), 500);
    await new Promise((resolve) => {
      this.waiters.push(resolve);
      if (session.finished) this.resolveWaiters();
    });
    clearInterval(progressTimer);
    if (this.ended) return false;
    this.message = 'Prueba terminada.';
    this.dirty = true;
    await sleep(1500);
    return true;
  }

  abort() {
    this.ended = true;
    this.resolveWaiters();
  }
}

// ---------------------------------------------------------------- Pantalla

export class ScreenCanvasRenderer extends BaseCanvasRenderer {
  /** @param geometry { pxPerMm, distanceMm } o null (demostración). */
  /** @param fieldDeg excentricidad que la prueba necesita ver completa. */
  constructor({ eye, geometry = null, fieldDeg = 15 }) {
    super({ eye });
    this.geometry = geometry;
    this.fieldDeg = fieldDeg;
    this.demoFieldDeg = fieldDeg + 2;
    this.keys = new Set();
  }

  async start(session) {
    const overlay = document.createElement('div');
    overlay.className = 'screen-test';
    overlay.innerHTML = '<canvas></canvas>';
    document.body.appendChild(overlay);
    this.overlay = overlay;
    this.canvas = overlay.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.dichoptic = session.dichoptic;

    this.onKeyDown = (e) => {
      if (DIRS[e.code]) {
        e.preventDefault();
        if (!e.repeat) this.emit({ type: 'dir', dir: DIRS[e.code] });
        this.keys.add(e.code);
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) this.emit({ type: 'select' });
      } else if (e.code === 'KeyM' || e.code === 'Tab') {
        e.preventDefault();
        this.emit({ type: 'alt' });
      } else if (e.code === 'Enter' || e.code === 'KeyF') {
        this.emit({ type: 'finish' });
      } else if (e.code === 'Escape') {
        this.abort();
      }
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onPointer = (e) => {
      e.preventDefault();
      if (!this.lastContext) return;
      const r = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const d = this.lastContext.toDeg((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
      this.emit({ type: 'pointer', x: d.x, y: d.y });
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    overlay.addEventListener('pointerdown', this.onPointer);
    overlay.requestFullscreen?.()?.catch(() => {});
    this.last = null;
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  /** La mitad menor de la pantalla, en grados, con la geometría actual. */
  visibleHalfDeg(w, h, focalPx) {
    return (Math.atan(Math.min(w, h) / 2 / focalPx) * 180) / Math.PI;
  }

  emit(evt) {
    if (this.tooSmall) return; // no se responde a una prueba que no se ve completa
    super.emit(evt);
  }

  frame(time) {
    if (this.ended && !this.overlay) return;
    const dt = this.last === null ? 0 : Math.min(0.1, (time - this.last) / 1000);
    this.last = time;
    const stick = {
      x: (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0),
      y: (this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('ArrowDown') ? 1 : 0),
    };
    this.step(dt, stick);

    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.dirty = true;
    }
    if (this.dirty && this.session) {
      this.dirty = false;
      const focalPx = this.geometry
        ? this.geometry.distanceMm * this.geometry.pxPerMm * dpr
        : Math.min(w, h) / 2 / Math.tan((this.demoFieldDeg * Math.PI) / 180);
      const { ctx } = this;
      const base = { ctx, width: w, height: h, focalPx, testedEye: this.testedEye, time: time / 1000 };
      ctx.globalCompositeOperation = 'source-over';
      this.tooSmall = this.visibleHalfDeg(w, h, focalPx) < this.fieldDeg;
      if (this.tooSmall) {
        const maxCm = Math.floor(((Math.min(w, h) / 2 / Math.tan((this.fieldDeg * Math.PI) / 180)) / (focalPx / this.geometry.distanceMm)) / 10);
        const c = makeDrawContext({ ...base, eye: 'both', anaglyph: false });
        c.clear(0.1);
        drawMessage(c, `La pantalla es chica para esta distancia.\nUse pantalla completa o acerque al paciente a ${maxCm} cm.\nEsc para salir.`);
      } else if (this.dichoptic) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        for (const eye of ['left', 'right']) {
          const c = makeDrawContext({ ...base, eye, anaglyph: true });
          this.session.draw(c);
          drawMessage(c, this.message);
          this.lastContext = c;
        }
        ctx.globalCompositeOperation = 'source-over';
      } else {
        const c = makeDrawContext({ ...base, eye: 'both', anaglyph: false });
        c.clear(this.session.background ?? 0.5);
        this.session.draw(c);
        drawMessage(c, this.message);
        this.lastContext = c;
      }
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  async stop() {
    this.abort();
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    this.overlay?.remove();
    this.overlay = null;
  }
}
