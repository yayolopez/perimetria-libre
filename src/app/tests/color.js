/** Visión de colores por contraste de conos con una C de Landolt de puntos. */
import { ColorTest, AXES, coneIsolating, linearToSrgb, DEFAULT_BACKGROUND } from '../../core/tests/color.js';
import { DIRECTIONS } from '../../core/tests/acuity.js';
import { createRng } from '../../core/math.js';
import { controls, TrialGap, afcObserver, fmt, fineprint, esc } from './common.js';

const FIELD_R = 4.6;
const C_OUTER = 3.6;
const C_INNER = 2.0;
const GAP_W = 1.6;
const JITTER = 0.25;
const UNIT = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] };
const GAP_BACKGROUND = 0.08; // gris lineal entre puntos

/** Puntos de tamaño variable que no se superponen. */
function makeDots(seed) {
  const rng = createRng(seed);
  const dots = [];
  for (let n = 0; n < 5000 && dots.length < 520; n++) {
    const r = 0.11 + rng() * 0.2;
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * (FIELD_R - r);
    const x = d * Math.cos(a);
    const y = d * Math.sin(a);
    if (dots.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + r + 0.03)) {
      dots.push({ x, y, r, j: 1 + JITTER * (2 * rng() - 1), dither: [rng(), rng(), rng()] });
    }
  }
  return dots;
}

function inC(dot, gap) {
  const d = Math.hypot(dot.x, dot.y);
  if (d < C_INNER || d > C_OUTER) return false;
  const [ux, uy] = UNIT[gap];
  const along = dot.x * ux + dot.y * uy;
  const across = Math.abs(dot.x * uy - dot.y * ux);
  return !(along > 0 && across < GAP_W / 2);
}

const toCss = (lin, dither) =>
  `rgb(${lin.map((v, i) => Math.min(255, Math.max(0, Math.floor(linearToSrgb(Math.min(1, Math.max(0, v))) * 255 + dither[i])))).join(',')})`;

function colorBars(axes) {
  return `<div class="bars">${Object.entries(axes)
    .map(([axis, a]) => {
      // Escala logarítmica de 0.1 % a 100 %.
      const w = Math.max(2, Math.min(100, ((a.logContrast + 3) / 3) * 100));
      return `<div class="bar"><span class="bar__label">${esc(AXES[axis].label)}</span>
        <span class="bar__track"><span class="bar__fill bar__fill--${axis}" style="width:${w}%"></span></span>
        <span class="bar__value">${a.exceedsMax ? '> máx.' : fmt(a.contrastPct, 1) + ' %'}</span></div>`;
    })
    .join('')}</div>`;
}

export default {
  id: 'color',
  name: 'Visión de colores',
  description: 'C de puntos de colores que solo se distingue por el color. Mide los ejes protan, deutan y tritan.',
  eyes: ['OU', 'OD', 'OI'],
  dichoptic: false,
  background: linearToSrgb(GAP_BACKGROUND),
  textureSize: 2048,
  fieldDeg: 5, // excentricidad máxima que debe entrar en la pantalla
  screenDistanceCm: 60,

  create({ rng, mode }) {
    const core = new ColorTest({ rng });
    const gap = new TrialGap(0.4);
    let trial = core.nextTrial();
    let dots = makeDots(trial.seed);
    const k = controls(mode);
    return {
      instructions: `Entre los puntos hay una letra C de otro color.\nIndique hacia dónde está su abertura con ${k.move}.\nSi no la ve, adivine. ${k.confirm[0].toUpperCase() + k.confirm.slice(1)} para comenzar.`,
      background: linearToSrgb(GAP_BACKGROUND),
      dichoptic: false,
      textureSize: 2048,
      draw(c) {
        if (!c.isTestedEye || gap.active) return;
        const bg = DEFAULT_BACKGROUND;
        const target = coneIsolating(bg, trial.axis, trial.contrast);
        for (const dot of dots) {
          const base = inC(dot, trial.gap) ? target : bg;
          c.circle(dot.x, dot.y, dot.r * 2, toCss(base.map((v) => v * dot.j), dot.dither));
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

  simulate({ rng }) {
    const core = new ColorTest({ rng });
    const see = afcObserver(rng, 0.25, 0.07);
    const truth = { protan: -1.9, deutan: -0.85, tritan: -1.2 }; // ejemplo: deutan
    while (!core.finished) {
      const t = core.nextTrial();
      const wrong = DIRECTIONS.filter((d) => d !== t.gap)[Math.floor(rng() * 3)];
      core.respond(t, see(t.logContrast, truth[t.axis]) ? t.gap : wrong);
    }
    return core.result();
  },

  summary: (d) => d.interpretation,

  report(d) {
    return `
      ${colorBars(d.axes)}
      <p><b>Lectura orientativa:</b> ${esc(d.interpretation)}</p>
      <table>
        <tr><th>Eje</th><th>Umbral de contraste de cono</th><th>Ensayos</th></tr>
        ${Object.entries(d.axes)
          .map(([axis, a]) => `<tr><td>${esc(AXES[axis].label)}</td><td>${a.exceedsMax ? 'mayor que el máximo de la pantalla' : fmt(a.contrastPct, 2) + ' %'}</td><td>${a.trials}</td></tr>`)
          .join('')}
      </table>
      ${fineprint('Barras más largas = peor discriminación. Los colores suponen una pantalla sRGB; sin calibración de color los valores son orientativos y no hay base normativa todavía.')}`;
  },
};
