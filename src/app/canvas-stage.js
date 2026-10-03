/**
 * Contexto de dibujo común para las pruebas que se dibujan en un lienzo
 * (agudeza, contraste, Amsler, estereopsis, color, foria, Hess).
 *
 * Las pruebas dibujan en GRADOS respecto del eje visual; el contexto convierte
 * a píxeles con proyección plana (gnomónica), igual en el visor y en pantalla.
 *
 * Pruebas dicópticas (cada ojo ve algo distinto):
 *   - en el visor, cada ojo tiene su propio lienzo;
 *   - en pantalla se usan lentes rojo/verde: rojo delante del ojo DERECHO
 *     (convención de Lancaster). Lo que ve el OD se dibuja en rojo y lo que ve
 *     el OI en verde, sobre fondo negro, y ambas pasadas se suman.
 */
const toRad = (d) => (d * Math.PI) / 180;

export const EYE_OF = { OD: 'right', OI: 'left' };

/**
 * @param focalPx   píxeles por radián en el centro (F · tan(θ) = desplazamiento)
 * @param eye       'left' | 'right' | 'both'
 * @param testedEye 'OD' | 'OI' | 'OU'
 * @param ipdM      distancia interpupilar en metros (visor) o null (pantalla)
 */
export function makeDrawContext({ ctx, width, height, focalPx, eye, testedEye, anaglyph, ipdM = null, time = 0 }) {
  const cx = width / 2;
  const cy = height / 2;
  const ppd = focalPx * toRad(1);
  const shade = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);

  const c = {
    ctx,
    width,
    height,
    eye,
    time,
    anaglyph,
    ppd,
    /** Este lienzo corresponde al ojo examinado (o a ambos). */
    isTestedEye: eye === 'both' || testedEye === 'OU' || EYE_OF[testedEye] === eye,
    /** Grados → píxeles del lienzo. */
    px(xDeg, yDeg) {
      const az = toRad(xDeg);
      return { x: cx + focalPx * Math.tan(az), y: cy - (focalPx * Math.tan(toRad(yDeg))) / Math.cos(az) };
    },
    /** Tamaño en píxeles de `deg` grados cerca de (xDeg, yDeg). */
    size(deg, xDeg = 0, yDeg = 0) {
      const ecc = toRad(Math.hypot(xDeg, yDeg));
      return (focalPx * Math.tan(toRad(deg))) / Math.cos(ecc) ** 1.5;
    },
    /** Píxeles → grados (para clics en pantalla). */
    toDeg(x, y) {
      const xDeg = (Math.atan((x - cx) / focalPx) * 180) / Math.PI;
      const yDeg = (Math.atan(((cy - y) * Math.cos(toRad(xDeg))) / focalPx) * 180) / Math.PI;
      return { x: xDeg, y: yDeg };
    },
    /**
     * Desplazamiento angular, para ESTE ojo, de un objeto en la línea media a
     * `distanceM` metros (convergencia). En pantalla los dos ojos miran la misma
     * superficie, así que es 0.
     */
    vergence(distanceM) {
      if (!ipdM || eye === 'both') return 0;
      const half = (Math.atan(ipdM / 2 / distanceM) * 180) / Math.PI;
      return eye === 'left' ? half : -half;
    },
    /** Color de dibujo para un nivel 0..1 (gris; en anaglifo, rojo u verde según el ojo). */
    ink(v) {
      const s = shade(v);
      if (!anaglyph) return `rgb(${s},${s},${s})`;
      return eye === 'right' ? `rgb(${s},0,0)` : `rgb(0,${s},0)`;
    },
    /** Rellena el fondo (negro en anaglifo). */
    clear(v) {
      if (anaglyph) return; // el renderer ya pintó de negro
      const s = shade(v);
      ctx.fillStyle = `rgb(${s},${s},${s})`;
      ctx.fillRect(0, 0, width, height);
    },
    circle(xDeg, yDeg, diameterDeg, color) {
      const p = c.px(xDeg, yDeg);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, c.size(diameterDeg / 2, xDeg, yDeg)), 0, Math.PI * 2);
      ctx.fill();
    },
    line(x1, y1, x2, y2, widthDeg, color) {
      const a = c.px(x1, y1);
      const b = c.px(x2, y2);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, c.size(widthDeg));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    },
    cross(xDeg, yDeg, armDeg, widthDeg, color) {
      c.line(xDeg - armDeg, yDeg, xDeg + armDeg, yDeg, widthDeg, color);
      c.line(xDeg, yDeg - armDeg, xDeg, yDeg + armDeg, widthDeg, color);
    },
    text(str, xDeg, yDeg, sizeDeg, color, align = 'center') {
      const p = c.px(xDeg, yDeg);
      ctx.fillStyle = color;
      ctx.font = `600 ${Math.max(10, c.size(sizeDeg))}px system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(str, p.x, p.y);
    },
  };
  return c;
}

/** Recuadro de mensaje (instrucciones) dibujado sobre la prueba. */
export function drawMessage(c, text) {
  if (!text) return;
  const { ctx } = c;
  const lines = text.split('\n');
  let fontPx = Math.max(14, c.size(1.1));
  ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
  let w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + fontPx * 2;
  // En pantallas angostas se achica el texto para que entre completo.
  if (w > c.width * 0.96) {
    fontPx *= (c.width * 0.96) / w;
    ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
    w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + fontPx * 2;
  }
  const h = lines.length * fontPx * 1.4 + fontPx * 1.2;
  const top = c.px(0, 11);
  const x = c.width / 2 - w / 2;
  const y = Math.max(8, top.y - h / 2);
  ctx.fillStyle = c.anaglyph ? (c.eye === 'right' ? 'rgb(90,0,0)' : 'rgb(0,90,0)') : 'rgba(0,0,0,0.8)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, fontPx * 0.6);
  ctx.fill();
  ctx.fillStyle = c.anaglyph ? c.ink(1) : '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, c.width / 2, y + fontPx * 1.3 + i * fontPx * 1.4));
}
