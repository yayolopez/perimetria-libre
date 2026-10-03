/** Estereoagudeza con estereogramas de puntos aleatorios. */
import { StereoTest } from '../../core/tests/stereo.js';
import { DIRECTIONS } from '../../core/tests/acuity.js';
import { createRng } from '../../core/math.js';
import { controls, TrialGap, afcObserver, fmt, fineprint } from './common.js';

const FIELD = 5; // semilado del campo de puntos, en grados
const DISC_R = 1.3;
const DISC_OFFSET = 2.8;
const DOT_DEG = 0.1;
const DOTS = 1400;
const DISC_CENTER = { up: [0, DISC_OFFSET], down: [0, -DISC_OFFSET], left: [-DISC_OFFSET, 0], right: [DISC_OFFSET, 0] };

/** Puntos del ensayo: posiciones fijas por semilla, para que ambos ojos coincidan. */
function makeDots(seed) {
  const rng = createRng(seed);
  return Array.from({ length: DOTS }, () => ({ x: (rng() * 2 - 1) * FIELD, y: (rng() * 2 - 1) * FIELD }));
}

function drawFrame(c) {
  const ink = c.ink(0.55);
  const e = FIELD + 0.8;
  c.line(-e, -e, e, -e, 0.08, ink);
  c.line(e, -e, e, e, 0.08, ink);
  c.line(e, e, -e, e, 0.08, ink);
  c.line(-e, e, -e, -e, 0.08, ink);
}

export default {
  id: 'stereo',
  name: 'Estereopsis',
  description: 'Estereogramas de puntos aleatorios: un círculo flota delante. Resultado en segundos de arco.',
  eyes: ['OU'],
  dichoptic: true,
  background: 0,
  textureSize: 2048,
  fieldDeg: 7, // excentricidad máxima que debe entrar en la pantalla
  screenDistanceCm: 40,

  create({ pxPerDeg, rng, mode }) {
    const core = new StereoTest({ pxPerDeg, rng });
    const gap = new TrialGap(0.45);
    let trial = core.nextTrial();
    let dots = makeDots(trial.seed);
    const k = controls(mode);
    return {
      instructions:
        `${mode === 'screen' ? 'Póngase los lentes rojo/verde (rojo en el ojo derecho).\n' : ''}` +
        `Uno de los 4 círculos (arriba, abajo, izquierda o derecha)\nse ve flotando delante de los puntos. Indíquelo con ${k.move}.\nSi no ve ninguno, adivine. ${k.confirm[0].toUpperCase() + k.confirm.slice(1)} para comenzar.`,
      background: 0,
      dichoptic: true,
      textureSize: 2048,
      draw(c) {
        drawFrame(c);
        c.cross(0, 0, 0.3, 0.06, c.ink(0.7));
        if (gap.active) return;
        const [dx, dy] = DISC_CENTER[trial.location];
        // Disparidad cruzada: la imagen del OI se corre a la derecha y la del OD a la izquierda.
        const shift = ((trial.arcsec / 3600) / 2) * (c.eye === 'left' ? 1 : c.eye === 'right' ? -1 : 0);
        const ink = c.ink(0.95);
        for (const d of dots) {
          const inDisc = Math.hypot(d.x - dx, d.y - dy) < DISC_R;
          c.circle(d.x + (inDisc ? shift : 0), d.y, DOT_DEG, ink);
        }
      },
      onInput(e) {
        if (e.type !== 'dir' || gap.active || core.finished) return false;
        core.respond(trial, e.dir);
        if (!core.finished) {
          trial = core.nextTrial();
          dots = makeDots(trial.seed);
        }
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
    const core = new StereoTest({ pxPerDeg, rng });
    const see = afcObserver(rng, 0.25, 0.08);
    while (!core.finished) {
      const t = core.nextTrial();
      const wrong = DIRECTIONS.filter((d) => d !== t.location)[Math.floor(rng() * 3)];
      core.respond(t, see(t.logArcsec, Math.log10(80)) ? t.location : wrong);
    }
    return core.result();
  },

  summary: (d) => (d.noStereo ? 'Sin estereopsis detectable' : `${d.arcsec}″${d.atLimit ? ' (límite del equipo)' : ''}`),

  report(d) {
    return `
      <div class="big-result">
        <div><span class="k">Estereoagudeza</span><b>${d.noStereo ? 'No detectada' : `${d.arcsec}″`}</b>
          <span class="muted">${d.noStereo ? 'no vio ni la disparidad máxima' : `± ${fmt(d.sd, 2)} log`}</span></div>
      </div>
      ${d.atLimit ? `<p class="banner">Vio la menor disparidad que este equipo puede mostrar (${d.limitArcsec}″). Su estereoagudeza real puede ser mejor.</p>` : ''}
      <table>
        <tr><th>Ensayos</th><td>${d.trials}</td></tr>
        <tr><th>Límite del equipo</th><td>${d.limitArcsec}″</td></tr>
        <tr><th>Referencia clínica habitual</th><td>≤ 60″ se considera normal en adultos</td></tr>
      </table>
      ${fineprint('Puntos aleatorios sin pistas monoculares; umbral al 62.5 % (4 alternativas).')}`;
  },
};
