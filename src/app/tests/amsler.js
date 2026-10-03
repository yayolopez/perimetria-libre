/** Rejilla de Amsler interactiva. */
import { AmslerTest, AMSLER_CELLS, AMSLER_CELL_DEG, MARK_TYPES } from '../../core/tests/amsler.js';
import { controls, fineprint, esc } from './common.js';

const MARK_COLORS = { distorted: 'rgba(255,190,0,0.6)', missing: 'rgba(255,70,70,0.65)' };
const HALF = (AMSLER_CELLS * AMSLER_CELL_DEG) / 2;

function amslerSvg(d) {
  const S = 300;
  const cell = S / AMSLER_CELLS;
  const lines = [];
  for (let k = 0; k <= AMSLER_CELLS; k++) {
    lines.push(`<line x1="${k * cell}" y1="0" x2="${k * cell}" y2="${S}"/><line x1="0" y1="${k * cell}" x2="${S}" y2="${k * cell}"/>`);
  }
  const marks = d.marks
    .map((m) => `<rect x="${m.i * cell}" y="${m.j * cell}" width="${cell}" height="${cell}" fill="${MARK_COLORS[m.type]}"/>`)
    .join('');
  return `<svg class="amsler" viewBox="-2 -2 ${S + 4} ${S + 4}" role="img" aria-label="Rejilla de Amsler">
    <rect x="0" y="0" width="${S}" height="${S}" fill="#111"/>${marks}
    <g stroke="#ddd" stroke-width="0.6">${lines.join('')}</g>
    <circle cx="${S / 2}" cy="${S / 2}" r="3.5" fill="#fff"/></svg>`;
}

export default {
  id: 'amsler',
  name: 'Rejilla de Amsler',
  description: 'El paciente marca dónde las líneas se ven torcidas o faltan. Útil en maculopatías.',
  eyes: ['OD', 'OI'],
  dichoptic: false,
  background: 0.03,
  textureSize: 2048,
  fieldDeg: 12, // excentricidad máxima que debe entrar en la pantalla
  screenDistanceCm: 30,

  create({ eye, mode }) {
    const core = new AmslerTest({ eye });
    const k = controls(mode);
    const pointerHint = mode === 'screen' ? ' o con un clic' : '';
    return {
      instructions:
        `Mire siempre el punto central. Si alguna zona de líneas\nse ve torcida, borrosa o falta, márquela: mueva el cuadro con ${k.move}\n` +
        `y marque con ${k.confirm}${pointerHint}. ${k.alt[0].toUpperCase() + k.alt.slice(1)} cambia el tipo de marca;\n${k.finish} termina. Presione ${k.confirm} para comenzar.`,
      background: 0.03,
      dichoptic: false,
      accum: { x: 0, y: 0 },
      draw(c) {
        if (!c.isTestedEye) return;
        const { ctx } = c;
        for (const m of core.result().marks) {
          const a = c.px(-HALF + m.i * AMSLER_CELL_DEG, HALF - m.j * AMSLER_CELL_DEG);
          const b = c.px(-HALF + (m.i + 1) * AMSLER_CELL_DEG, HALF - (m.j + 1) * AMSLER_CELL_DEG);
          ctx.fillStyle = MARK_COLORS[m.type];
          ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        }
        for (let n = 0; n <= AMSLER_CELLS; n++) {
          const v = -HALF + n * AMSLER_CELL_DEG;
          c.line(v, -HALF, v, HALF, 0.05, c.ink(0.85));
          c.line(-HALF, v, HALF, v, 0.05, c.ink(0.85));
        }
        c.circle(0, 0, 0.45, c.ink(1));
        const cur = core.cursor;
        const a = c.px(-HALF + cur.i * AMSLER_CELL_DEG, HALF - cur.j * AMSLER_CELL_DEG);
        const b = c.px(-HALF + (cur.i + 1) * AMSLER_CELL_DEG, HALF - (cur.j + 1) * AMSLER_CELL_DEG);
        ctx.strokeStyle = 'rgb(0,200,255)';
        ctx.lineWidth = Math.max(2, c.size(0.1));
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        c.text(`Marcando: ${MARK_TYPES[core.mode].toLowerCase()} · ${core.result().marks.length} cuadros`, 0, -HALF - 1.5, 0.8, c.ink(0.8));
      },
      onInput(e) {
        if (e.type === 'dir') core.moveCursor({ left: -1, right: 1, up: 0, down: 0 }[e.dir], { up: -1, down: 1, left: 0, right: 0 }[e.dir]);
        else if (e.type === 'select') core.toggle();
        else if (e.type === 'alt') core.cycleMode();
        else if (e.type === 'finish') core.finish();
        else if (e.type === 'pointer') {
          const cell = AmslerTest.cellAt(e.x, e.y);
          if (!cell) return false;
          core.cursor = cell;
          core.toggle(cell.i, cell.j);
        } else return false;
        return true;
      },
      tick(dt, stick) {
        // Mantener la palanca inclinada mueve el cuadro de forma continua.
        const speed = 6; // cuadros por segundo
        this.accum.x += stick.x * speed * dt;
        this.accum.y += stick.y * speed * dt;
        const di = Math.trunc(this.accum.x);
        const dj = Math.trunc(this.accum.y);
        if (!di && !dj) return false;
        this.accum.x -= di;
        this.accum.y -= dj;
        core.moveCursor(di, -dj);
        return true;
      },
      get finished() {
        return core.finished;
      },
      progress: () => 0.5,
      result: () => core.result(),
    };
  },

  simulate({ eye = 'OD' }) {
    const core = new AmslerTest({ eye });
    // Metamorfopsia paracentral inferior-temporal, como en una membrana epirretiniana.
    for (const [i, j] of [[11, 11], [12, 11], [11, 12], [12, 12], [13, 12]]) core.toggle(i, j, 'distorted');
    core.toggle(10, 10, 'missing');
    core.finish();
    return core.result();
  },

  summary: (d) => (d.normal ? 'Sin alteraciones' : `${d.distorted} cuadros torcidos, ${d.missing} faltantes`),

  report(d) {
    return `
      <div class="report__maps">
        <figure>${amslerSvg(d)}<figcaption>
          <span class="swatch" style="background:${MARK_COLORS.distorted}"></span> torcido ·
          <span class="swatch" style="background:${MARK_COLORS.missing}"></span> falta o borroso</figcaption></figure>
        <table>
          <tr><th>Resultado</th><td>${d.normal ? 'Sin alteraciones' : 'Con alteraciones'}</td></tr>
          <tr><th>Cuadros torcidos</th><td>${d.distorted}</td></tr>
          <tr><th>Cuadros faltantes o borrosos</th><td>${d.missing}</td></tr>
          <tr><th>Dentro de 2.5° del centro</th><td>${d.central}</td></tr>
          ${Object.entries(d.quadrants).map(([q, n]) => `<tr><th>Cuadrante ${esc(q)}</th><td>${n}</td></tr>`).join('')}
        </table>
      </div>
      ${fineprint('Cuadros de 1° (rejilla de 20° × 20°).')}`;
  },
};
