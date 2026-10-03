/** Foria subjetiva con disociación tipo varilla de Maddox. */
import { PhoriaTest, PHORIA_DISTANCES } from '../../core/tests/phoria.js';
import { EYE_OF } from '../canvas-stage.js';
import { controls, Notice, fmt, fineprint, esc } from './common.js';

const LINE_HALF = 14;
const SPEED_DEG_S = 3;
const NUDGE_DEG = 0.1;
const DIST_LABEL = { lejos: 'Lejos (6 m)', cerca: 'Cerca (40 cm)', pantalla: 'Distancia de la pantalla' };

export default {
  id: 'phoria',
  name: 'Foria (Maddox)',
  description: 'Un ojo ve una luz y el otro una línea; el paciente las alinea. Resultado en dioptrías prismáticas.',
  eyes: ['OD', 'OI'],
  eyeLabel: 'Ojo con la línea',
  dichoptic: true,
  background: 0,
  textureSize: 1024,
  fieldDeg: 4, // excentricidad máxima que debe entrar en la pantalla
  screenDistanceCm: 40,

  create({ eye, rng, mode, screenDistanceM }) {
    const distances = mode === 'screen' ? { pantalla: screenDistanceM } : PHORIA_DISTANCES;
    const core = new PhoriaTest({ lineEye: eye, distances, rng });
    const notice = new Notice();
    const k = controls(mode);
    const lineCanvas = EYE_OF[eye];
    const announce = () => {
      const s = core.current;
      if (s) notice.show(`${DIST_LABEL[s.distanceName]} · línea ${s.direction === 'horizontal' ? 'vertical' : 'horizontal'}`, 1.6);
    };
    let started = false;
    return {
      instructions:
        `${mode === 'screen' ? 'Póngase los lentes rojo/verde (rojo en el ojo derecho).\n' : ''}` +
        `Verá una luz con un ojo y una línea con el otro.\nMueva la línea con ${k.move} hasta que pase justo por la luz\ny confirme con ${k.confirm}. Presione ${k.confirm} para comenzar.`,
      background: 0,
      dichoptic: true,
      textureSize: 1024,
      draw(c) {
        const s = core.current;
        if (!s) return;
        if (notice.text) c.text(notice.text, 0, -8, 0.9, c.ink(0.8));
        const v = c.vergence(s.distanceM);
        if (c.eye === lineCanvas) {
          if (s.direction === 'horizontal') c.line(v + core.offsetDeg, -LINE_HALF, v + core.offsetDeg, LINE_HALF, 0.15, c.ink(1));
          else c.line(v - LINE_HALF, core.offsetDeg, v + LINE_HALF, core.offsetDeg, 0.15, c.ink(1));
        } else {
          c.circle(v, 0, 0.45, c.ink(1));
        }
      },
      onInput(e) {
        const s = core.current;
        if (!s) return false;
        if (e.type === 'select') {
          core.confirm();
          announce();
          return true;
        }
        if (e.type === 'dir') {
          const horiz = s.direction === 'horizontal';
          const delta = { left: horiz ? -NUDGE_DEG : 0, right: horiz ? NUDGE_DEG : 0, up: horiz ? 0 : NUDGE_DEG, down: horiz ? 0 : -NUDGE_DEG }[e.dir];
          if (!delta) return false;
          core.move(delta);
          return true;
        }
        return false;
      },
      tick(dt, stick) {
        let changed = notice.tick(dt);
        if (!started && core.current) {
          started = true;
          announce();
          changed = true;
        }
        const s = core.current;
        if (!s) return changed;
        const axis = s.direction === 'horizontal' ? stick.x : stick.y;
        if (axis) {
          core.move(axis * SPEED_DEG_S * dt);
          changed = true;
        }
        return changed;
      },
      get finished() {
        return core.finished;
      },
      progress: () => core.progress(),
      result: () => core.result(),
    };
  },

  simulate({ rng, eye = 'OD' }) {
    const core = new PhoriaTest({ lineEye: eye, rng });
    // Ejemplo: exoforia de 2 Δ de lejos y 8 Δ de cerca, sin foria vertical.
    const target = { lejos: 1.15, cerca: 4.57 };
    const sign = eye === 'OD' ? 1 : -1;
    while (!core.finished) {
      const s = core.current;
      const goal = s.direction === 'horizontal' ? sign * target[s.distanceName] : 0;
      core.move(goal - core.offsetDeg + (rng() - 0.5) * 0.3);
      core.confirm();
    }
    return core.result();
  },

  summary: (d) =>
    d.measurements
      .filter((m) => m.direction === 'horizontal')
      .map((m) => `${m.distanceName}: ${m.type === 'Ortoforia' ? 'orto' : `${m.pd} Δ ${m.type.toLowerCase()}`}`)
      .join(' · '),

  report(d) {
    return `
      <table>
        <tr><th>Distancia</th><th>Dirección</th><th>Resultado</th><th>Dioptrías prismáticas</th><th>Dispersión entre repeticiones</th></tr>
        ${d.measurements
          .map(
            (m) => `<tr><td>${esc(DIST_LABEL[m.distanceName] ?? m.distanceName)}</td><td>${m.direction}</td>
              <td><b>${esc(m.type)}</b></td><td>${m.type === 'Ortoforia' ? '< 1 Δ' : `${m.pd} Δ`}</td><td>${fmt(m.spreadPd, 1)} Δ</td></tr>`,
          )
          .join('')}
      </table>
      <p class="muted">Línea vista por el ${d.lineEye === 'OD' ? 'ojo derecho' : 'ojo izquierdo'}.</p>
      ${fineprint('Prueba subjetiva. En el visor la acomodación no cambia con la distancia simulada, así que la foria de cerca puede diferir de la medida con prismas.')}`;
  },
};
