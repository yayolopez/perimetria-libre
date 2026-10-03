/**
 * Temporización de estímulos sincronizada con los cuadros de la pantalla.
 * El estímulo se enciende en el próximo cuadro y se apaga cuando transcurre
 * `durationMs` (con tolerancia de medio cuadro). La promesa de `present`
 * resuelve con el instante real de encendido.
 */
export class TimedPresenter {
  constructor() {
    this.pending = null;
    this.active = null;
    this.lastFrame = null;
    this.frameMs = 1000 / 72;
  }

  present(stimulus, durationMs) {
    return new Promise((resolve) => {
      this.pending?.resolve(null);
      this.pending = { stimulus, durationMs, resolve };
    });
  }

  /** Se llama al comienzo de cada cuadro; devuelve el estímulo a dibujar o null. */
  tick(time) {
    if (this.lastFrame !== null) {
      const dt = time - this.lastFrame;
      if (dt > 0 && dt < 100) this.frameMs = 0.9 * this.frameMs + 0.1 * dt;
    }
    this.lastFrame = time;

    if (this.active && time - this.active.onset >= this.active.durationMs - this.frameMs / 2) {
      this.active = null;
    }
    if (this.pending && !this.active) {
      const { stimulus, durationMs, resolve } = this.pending;
      this.pending = null;
      this.active = { stimulus, durationMs, onset: time };
      resolve(time);
    }
    return this.active?.stimulus ?? null;
  }

  cancel() {
    this.pending?.resolve(null);
    this.pending = null;
    this.active = null;
  }
}
