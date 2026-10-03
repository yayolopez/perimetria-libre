/** Sonido breve que confirma al paciente que su respuesta fue registrada. */
export class ResponseSound {
  constructor() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      this.ctx = null;
    }
  }

  /** Los navegadores exigen un gesto del usuario para activar el audio. */
  unlock() {
    this.ctx?.resume?.().catch(() => {});
  }

  click() {
    const { ctx } = this;
    if (!ctx || ctx.state !== 'running') return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.07);
  }
}
