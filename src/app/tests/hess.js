/** Pantalla de Hess-Lancaster subjetiva (9 posiciones de mirada a 15°). */
import { HessTest, HESS_POSITIONS, HESS_FIELD_DEG } from '../../core/tests/hess.js';
import { EYE_OF } from '../canvas-stage.js';
import { controls, Notice, fmt, fineprint } from './common.js';

const SPEED_DEG_S = 6;
const NUDGE_DEG = 0.25;
const TEST_DISTANCE_M = 1;

const targetColor = (c) => (c.anaglyph ? c.ink(1) : 'rgb(235,60,60)');
const cursorColor = (c) => (c.anaglyph ? c.ink(1) : 'rgb(70,225,100)');

/** Gráfico de Hess de un ojo: rejilla de referencia y posiciones medidas. */
function hessChart(records, title) {
  const S = 240;
  const lim = HESS_FIELD_DEG + 10;
  const sx = (x) => S / 2 + (x / lim) * (S / 2 - 10);
  const sy = (y) => S / 2 - (y / lim) * (S / 2 - 10);
  const order = [[-15, 15], [0, 15], [15, 15], [15, 0], [15, -15], [0, -15], [-15, -15], [-15, 0]];
  const find = (x, y) => records.find((r) => r.x === x && r.y === y);
  const ref = order.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x)},${sy(y)}`).join(' ') + 'Z';
  const measured = order.map(([x, y]) => find(x, y)).filter(Boolean);
  const path = measured.map((r, i) => `${i ? 'L' : 'M'}${sx(r.cursorX)},${sy(r.cursorY)}`).join(' ') + (measured.length === 8 ? 'Z' : '');
  const grid = [-20, -15, -10, -5, 0, 5, 10, 15, 20]
    .map((v) => `<line x1="${sx(v)}" y1="${sy(-lim)}" x2="${sx(v)}" y2="${sy(lim)}"/><line x1="${sx(-lim)}" y1="${sy(v)}" x2="${sx(lim)}" y2="${sy(v)}"/>`)
    .join('');
  return `<figure><svg class="hess" viewBox="0 0 ${S} ${S}" role="img" aria-label="${title}">
      <g class="grid">${grid}</g>
      <path d="${ref}" class="ref"/>
      ${HESS_POSITIONS.map(([x, y]) => `<circle cx="${sx(x)}" cy="${sy(y)}" r="2.5" class="ref-dot"/>`).join('')}
      <path d="${path}" class="meas"/>
      ${records.map((r) => `<circle cx="${sx(r.cursorX)}" cy="${sy(r.cursorY)}" r="3.5" class="meas-dot"/>`).join('')}
    </svg><figcaption>${title}</figcaption></figure>`;
}

export default {
  id: 'hess',
  name: 'Hess / Lancaster',
  description: 'Superponer una cruz verde sobre una marca roja en 9 posiciones de mirada, con cada ojo fijando.',
  eyes: ['OU'],
  dichoptic: true,
  background: 0,
  textureSize: 1024,
  fieldDeg: 21, // excentricidad máxima que debe entrar en la pantalla
  screenDistanceCm: 50,

  create({ rng, mode }) {
    const core = new HessTest({ rng });
    const notice = new Notice();
    const k = controls(mode);
    let lastFixing = null;
    const announce = () => {
      const s = core.current;
      if (s && s.fixingEye !== lastFixing) {
        notice.show(s.fixingEye === 'OD' ? 'Primera parte' : 'Segunda parte: cambia el ojo que ve la marca', 2);
        lastFixing = s.fixingEye;
      }
    };
    announce();
    return {
      instructions:
        `${mode === 'screen' ? 'Póngase los lentes rojo/verde (rojo en el ojo derecho).\n' : ''}` +
        `No mueva la cabeza: solo los ojos. Lleve la cruz verde\nencima de la marca roja con ${k.move} y confirme con ${k.confirm}.\nPresione ${k.confirm} para comenzar.`,
      background: 0,
      dichoptic: true,
      textureSize: 1024,
      draw(c) {
        const s = core.current;
        if (!s) return;
        if (notice.text) c.text(notice.text, 0, -18, 1, c.ink(0.8));
        const v = c.vergence(TEST_DISTANCE_M);
        if (c.eye === EYE_OF[s.fixingEye]) {
          const p = c.px(s.x + v, s.y);
          const half = c.size(0.35, s.x, s.y);
          c.ctx.fillStyle = targetColor(c);
          c.ctx.fillRect(p.x - half, p.y - half, half * 2, half * 2);
        } else if (c.eye !== 'both') {
          c.cross(core.cursor.x + v, core.cursor.y, 0.8, 0.12, cursorColor(c));
        }
      },
      onInput(e) {
        if (!core.current) return false;
        if (e.type === 'select') {
          core.confirm();
          announce();
          return true;
        }
        if (e.type === 'dir') {
          const [dx, dy] = { left: [-NUDGE_DEG, 0], right: [NUDGE_DEG, 0], up: [0, NUDGE_DEG], down: [0, -NUDGE_DEG] }[e.dir];
          core.move(dx, dy);
          return true;
        }
        return false;
      },
      tick(dt, stick) {
        let changed = notice.tick(dt);
        if (core.current && (stick.x || stick.y)) {
          core.move(stick.x * SPEED_DEG_S * dt, stick.y * SPEED_DEG_S * dt);
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

  simulate({ rng }) {
    const core = new HessTest({ rng });
    // Ejemplo: paresia del recto lateral izquierdo (el OI no llega en la mirada a la izquierda).
    while (!core.finished) {
      const s = core.current;
      let dx = 0;
      if (s.fixingEye === 'OD' && s.x < 0) dx = 4; // OI corto hacia la izquierda
      if (s.fixingEye === 'OI' && s.x < 0) dx = -7; // hiperfunción secundaria del OD (recto medio)
      core.move(s.x + dx - core.cursor.x + (rng() - 0.5) * 0.4, s.y - core.cursor.y + (rng() - 0.5) * 0.4);
      core.confirm();
    }
    return core.result();
  },

  summary: (d) => `Desviación máxima: OI ${fmt(d.maxLeftPd, 0)} Δ · OD ${fmt(d.maxRightPd, 0)} Δ`,

  report(d) {
    return `
      <div class="report__maps">
        ${hessChart(d.leftEye, 'Ojo izquierdo (fija el derecho)')}
        ${hessChart(d.rightEye, 'Ojo derecho (fija el izquierdo)')}
      </div>
      <table>
        <tr><th>Desviación en posición primaria</th><td>OI ${fmt(d.primaryLeftPd, 1)} Δ · OD ${fmt(d.primaryRightPd, 1)} Δ</td></tr>
        <tr><th>Desviación máxima</th><td>OI ${fmt(d.maxLeftPd, 1)} Δ · OD ${fmt(d.maxRightPd, 1)} Δ</td></tr>
      </table>
      <p class="muted">Gris: posiciones de referencia (campo de 15°). Color: dónde apunta el ojo no fijador. Un cuadro más chico indica hipofunción; uno más grande, hiperfunción.</p>
      ${fineprint('Prueba subjetiva; requiere correspondencia retiniana normal.')}`;
  },
};
