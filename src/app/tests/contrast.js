/** Sensibilidad al contraste con parches de Gabor (2 alternativas: izquierda/derecha). */
import { ContrastSensitivityTest, GABOR_SIGMA_DEG, GABOR_OFFSET_DEG } from '../../core/tests/contrast.js';
import { controls, TrialGap, afcObserver, fmt, fineprint } from './common.js';

const MEAN_CODE = 128;

/** Código fraccionario (0..255) que produce la luminancia L según la tabla del perfil. */
function fractionalCode(table, L) {
  let lo = 0;
  let hi = table.length - 1;
  if (L <= table[0]) return 0;
  if (L >= table[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid] <= L) lo = mid;
    else hi = mid;
  }
  return lo + (L - table[lo]) / (table[hi] - table[lo]);
}

/**
 * Gabor con luminancia linealizada por el perfil de calibración y dithering
 * aleatorio: así se logran contrastes menores que un paso de 8 bits.
 */
function drawGabor(c, xDeg, cpd, contrast, table, rng) {
  const sigma = c.size(GABOR_SIGMA_DEG, xDeg, 0);
  const r = Math.ceil(3 * sigma);
  const center = c.px(xDeg, 0);
  const img = c.ctx.createImageData(2 * r + 1, 2 * r + 1);
  const Lmean = table[MEAN_CODE];
  const k = (2 * Math.PI * cpd) / c.size(1, xDeg, 0);
  const phase = rng() * Math.PI * 2;
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const g = Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
      const L = Lmean * (1 + contrast * g * Math.cos(k * x + phase));
      const v = Math.min(255, Math.max(0, Math.floor(fractionalCode(table, L) + rng())));
      const i = ((y + r) * (2 * r + 1) + (x + r)) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  c.ctx.putImageData(img, Math.round(center.x - r), Math.round(center.y - r));
}

function csfSvg(freqs) {
  const W = 420;
  const H = 260;
  const pad = 40;
  const fx = (f) => pad + ((Math.log10(f) - Math.log10(1)) / (Math.log10(24) - Math.log10(1))) * (W - pad - 10);
  const fy = (cs) => H - pad - (cs / 2.5) * (H - pad - 10);
  const pts = freqs.filter((f) => !f.notSeen);
  const path = pts.map((f, i) => `${i ? 'L' : 'M'}${fx(f.cpd)},${fy(f.logCS)}`).join(' ');
  const ticksX = [1, 1.5, 3, 6, 12, 18, 24]
    .map((f) => `<text x="${fx(f)}" y="${H - pad + 16}" class="tick">${f}</text><line x1="${fx(f)}" x2="${fx(f)}" y1="10" y2="${H - pad}" class="grid"/>`)
    .join('');
  const ticksY = [0, 0.5, 1, 1.5, 2, 2.5]
    .map((v) => `<text x="${pad - 6}" y="${fy(v)}" class="tick" text-anchor="end">${v}</text><line x1="${pad}" x2="${W - 10}" y1="${fy(v)}" y2="${fy(v)}" class="grid"/>`)
    .join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Curva de sensibilidad al contraste">
    ${ticksX}${ticksY}
    <path d="${path}" class="series"/>
    ${pts.map((f) => `<circle cx="${fx(f.cpd)}" cy="${fy(f.logCS)}" r="4" class="series-dot"/>`).join('')}
    <text x="${W / 2}" y="${H - 4}" class="axis-label">ciclos por grado</text>
    <text x="12" y="${H / 2}" class="axis-label" transform="rotate(-90 12 ${H / 2})">log CS</text>
  </svg>`;
}

export default {
  id: 'contrast',
  name: 'Sensibilidad al contraste',
  description: 'Curva de sensibilidad al contraste con rejillas de Gabor a varias frecuencias.',
  eyes: ['OD', 'OI', 'OU'],
  dichoptic: false,
  background: MEAN_CODE / 255,
  textureSize: 2048,
  fieldDeg: 8, // excentricidad máxima que debe entrar en la pantalla
  screenDistanceCm: 100,

  create({ pxPerDeg, rng, mode, display }) {
    const core = new ContrastSensitivityTest({ pxPerDeg, rng });
    const gap = new TrialGap(0.4);
    const table = display.table;
    let trial = core.nextTrial();
    const k = controls(mode);
    return {
      instructions: `Mire el punto central. Aparecerán rayas suaves\na la izquierda o a la derecha: indique el lado con ${k.move}.\nSi no ve nada, adivine. ${k.confirm[0].toUpperCase() + k.confirm.slice(1)} para comenzar.`,
      background: MEAN_CODE / 255,
      dichoptic: false,
      textureSize: 2048,
      draw(c) {
        if (c.isTestedEye && !gap.active) {
          drawGabor(c, trial.side === 'left' ? -GABOR_OFFSET_DEG : GABOR_OFFSET_DEG, trial.cpd, trial.contrast, table, rng);
        }
        c.circle(0, 0, 0.25, c.ink(0.2));
      },
      onInput(e) {
        if (e.type !== 'dir' || (e.dir !== 'left' && e.dir !== 'right') || gap.active || core.finished) return false;
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
    const core = new ContrastSensitivityTest({ pxPerDeg, rng });
    const see = afcObserver(rng, 0.5, 0.08);
    const truth = (f) => 1.9 - 0.9 * Math.log10(f / 3) ** 2 * 2.2;
    while (!core.finished) {
      const t = core.nextTrial();
      const ok = see(t.logContrast, -truth(t.cpd));
      core.respond(t, ok ? t.side : t.side === 'left' ? 'right' : 'left');
    }
    return core.result();
  },

  summary: (d) => d.frequencies.map((f) => `${f.cpd} cpd: ${f.notSeen ? 'no vio' : fmt(f.logCS, 2)}`).join(' · '),

  report(d) {
    return `
      ${csfSvg(d.frequencies)}
      <table>
        <tr><th>Frecuencia</th><th>log CS</th><th>Contraste umbral</th><th>Ensayos</th></tr>
        ${d.frequencies
          .map(
            (f) => `<tr><td>${f.cpd} cpd</td><td>${f.notSeen ? 'no vio' : fmt(f.logCS, 2)}${f.atLimit ? ' (límite del equipo)' : ''}</td>
              <td>${f.notSeen ? '—' : fmt(100 * 10 ** -f.logCS, 2) + ' %'}</td><td>${f.trials}</td></tr>`,
          )
          .join('')}
      </table>
      ${d.frequencies.length < 3 ? '<p class="banner">La resolución del equipo solo permite frecuencias bajas: en un visor las frecuencias altas no se pueden mostrar con nitidez.</p>' : ''}
      ${fineprint('Contraste de Michelson. Sin base normativa propia todavía.')}`;
  },
};
