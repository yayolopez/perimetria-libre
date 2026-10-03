/** Agudeza visual con E de Snellen. */
import { AcuityTest, DIRECTIONS } from '../../core/tests/acuity.js';
import { controls, TrialGap, afcObserver, fmt, fineprint, esc } from './common.js';

const ROTATION = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

/** E con las patas hacia `dir`; mide 5 × 5 unidades de trazo. */
function drawE(c, sizeDeg, dir, color) {
  const u = c.size(sizeDeg) / 5;
  const p = c.px(0, 0);
  const { ctx } = c;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ROTATION[dir]);
  ctx.fillStyle = color;
  ctx.fillRect(-2.5 * u, -2.5 * u, u, 5 * u);
  ctx.fillRect(-2.5 * u, -2.5 * u, 5 * u, u);
  ctx.fillRect(-2.5 * u, -0.5 * u, 5 * u, u);
  ctx.fillRect(-2.5 * u, 1.5 * u, 5 * u, u);
  ctx.restore();
}

export default {
  id: 'acuity',
  name: 'Agudeza visual',
  description: 'E de Snellen en 4 orientaciones con escalera adaptativa. Resultado en logMAR, Snellen y decimal.',
  eyes: ['OD', 'OI', 'OU'],
  dichoptic: false,
  background: 0.9,
  textureSize: 2048,
  fieldDeg: 3, // excentricidad máxima que debe entrar en la pantalla
  screenDistanceCm: 300,

  create({ pxPerDeg, rng, mode }) {
    const core = new AcuityTest({ pxPerDeg, rng });
    const gap = new TrialGap(0.3);
    let trial = core.nextTrial();
    const k = controls(mode);
    return {
      instructions: `Indique hacia dónde apuntan las patas de la E\ncon ${k.move}. Si no está seguro, adivine.\nPresione ${k.confirm} para comenzar.`,
      background: 0.9,
      dichoptic: false,
      draw(c) {
        if (!c.isTestedEye || gap.active) return;
        drawE(c, trial.sizeDeg, trial.dir, c.ink(0));
      },
      onInput(e) {
        if (e.type !== 'dir' || gap.active || core.finished) return false;
        core.respond(trial, e.dir);
        if (!core.finished) trial = core.nextTrial();
        gap.start();
        return true;
      },
      tick: (dt) => gap.tick(dt),
      get finished() {
        return core.finished;
      },
      progress: () => core.progress(),
      result: () => core.result(),
    };
  },

  simulate({ pxPerDeg, rng }) {
    const core = new AcuityTest({ pxPerDeg, rng });
    const see = afcObserver(rng, 0.25, 0.04);
    while (!core.finished) {
      const t = core.nextTrial();
      const wrong = DIRECTIONS.filter((d) => d !== t.dir)[Math.floor(rng() * 3)];
      core.respond(t, see(t.logMAR, 0.18) ? t.dir : wrong);
    }
    return core.result();
  },

  summary: (d) => `${d.snellen20} · logMAR ${fmt(d.logMAR, 2)}${d.atLimit ? ' (límite del equipo)' : ''}`,

  report(d) {
    return `
      <div class="big-result">
        <div><span class="k">Snellen</span><b>${esc(d.snellen20)}</b><span class="muted">${esc(d.snellen6)}</span></div>
        <div><span class="k">logMAR</span><b>${fmt(d.logMAR, 2)}</b><span class="muted">± ${fmt(d.sd, 2)}</span></div>
        <div><span class="k">Decimal</span><b>${fmt(d.decimal, 2)}</b></div>
      </div>
      ${d.atLimit ? `<p class="banner">El paciente vio hasta el tamaño más chico que este equipo puede mostrar (logMAR ${fmt(d.limitLogMAR, 2)}). Su agudeza real puede ser mejor.</p>` : ''}
      <table><tr><th>Ensayos</th><td>${d.trials}</td></tr>
      <tr><th>Límite del equipo</th><td>logMAR ${fmt(d.limitLogMAR, 2)} (trazo de 1 píxel)</td></tr></table>
      ${fineprint('Umbral: 62.5 % de respuestas correctas con 4 orientaciones.')}`;
  },
};
