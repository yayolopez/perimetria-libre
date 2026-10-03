/**
 * Vigilancia de la mirada con la cámara web (EXPERIMENTAL, modo pantalla).
 *
 * Usa MediaPipe Face Landmarker, que corre dentro del navegador: las imágenes
 * de la cámara no salen del equipo. Con los puntos del iris y de los párpados
 * del ojo examinado estima:
 *   - desviación de la mirada respecto de la fijación (grados aproximados),
 *   - parpadeos,
 *   - distancia ojo-cámara (por el diámetro del iris, ~11.7 mm).
 * La precisión es de varios grados: sirve para detectar pérdidas de fijación
 * groseras, no para un seguimiento fino como el de un perímetro comercial.
 */
const VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const IRIS_DIAMETER_MM = 11.7;
const CAMERA_HFOV_DEG = 65; // supuesto típico de una cámara web
const EYE_WIDTH_MM = 30; // ancho promedio de la hendidura palpebral
const EYE_RADIUS_MM = 12;

// Índices de MediaPipe Face Mesh (ojo derecho del sujeto = 33/133, izquierdo = 362/263).
const EYES = {
  OD: { outer: 33, inner: 133, upper: 159, lower: 145, iris: [468, 469, 470, 471, 472] },
  OI: { outer: 263, inner: 362, upper: 386, lower: 374, iris: [473, 474, 475, 476, 477] },
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class WebcamGazeMonitor {
  constructor({ eye = 'OD', maxDeviationDeg = 6 } = {}) {
    this.eyeIdx = EYES[eye] ?? EYES.OD;
    this.maxDeviationDeg = maxDeviationDeg;
    this.latest = null;
    this.baseline = null;
    this.running = false;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    this.video = Object.assign(document.createElement('video'), { muted: true, playsInline: true });
    this.video.srcObject = this.stream;
    await this.video.play();

    const { FilesetResolver, FaceLandmarker } = await import(`${VISION_URL}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${VISION_URL}/wasm`);
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
    });
    this.running = true;
    this.loop();
  }

  loop() {
    if (!this.running) return;
    const now = performance.now();
    if (this.video.readyState >= 2) {
      const res = this.landmarker.detectForVideo(this.video, now);
      this.latest = this.measure(res.faceLandmarks?.[0], now);
    }
    this.raf = requestAnimationFrame(() => this.loop());
  }

  /** Medidas crudas del ojo examinado en píxeles de la imagen. */
  measure(landmarks, t) {
    if (!landmarks) return { t, face: false };
    const w = this.video.videoWidth;
    const h = this.video.videoHeight;
    const px = (i) => ({ x: landmarks[i].x * w, y: landmarks[i].y * h });
    const e = this.eyeIdx;
    const outer = px(e.outer);
    const inner = px(e.inner);
    const eyeWidth = dist(outer, inner);
    const center = { x: (outer.x + inner.x) / 2, y: (outer.y + inner.y) / 2 };
    const iris = px(e.iris[0]);
    const irisDiameter = (dist(px(e.iris[1]), px(e.iris[3])) + dist(px(e.iris[2]), px(e.iris[4]))) / 2;
    const openness = dist(px(e.upper), px(e.lower)) / eyeWidth;
    const focalPx = w / 2 / Math.tan(((CAMERA_HFOV_DEG / 2) * Math.PI) / 180);
    return {
      t,
      face: true,
      offset: { x: (iris.x - center.x) / eyeWidth, y: (iris.y - center.y) / eyeWidth },
      openness,
      irisDiameter,
      distanceMm: irisDiameter > 0 ? (focalPx * IRIS_DIAMETER_MM) / irisDiameter : null,
    };
  }

  /** Registra la posición de referencia mientras el paciente mira la fijación. */
  async calibrate(durationMs = 1200) {
    const samples = [];
    const end = performance.now() + durationMs;
    while (performance.now() < end) {
      if (this.latest?.face) samples.push(this.latest);
      await new Promise((r) => setTimeout(r, 50));
    }
    if (samples.length < 5) return false;
    const avg = (f) => samples.reduce((a, s) => a + f(s), 0) / samples.length;
    this.baseline = {
      x: avg((s) => s.offset.x),
      y: avg((s) => s.offset.y),
      openness: avg((s) => s.openness),
    };
    return true;
  }

  /** Estado actual: { ok, lost, blink, deviationDeg, distanceMm }. */
  sample() {
    const s = this.latest;
    if (!s || !s.face || performance.now() - s.t > 300) {
      return { ok: false, lost: true, blink: false, deviationDeg: null, distanceMm: null };
    }
    const base = this.baseline ?? { x: 0, y: 0, openness: s.openness };
    const blink = s.openness < base.openness * 0.5;
    const toDeg = (frac) =>
      (Math.asin(Math.max(-1, Math.min(1, (frac * EYE_WIDTH_MM) / EYE_RADIUS_MM))) * 180) / Math.PI;
    const deviationDeg = Math.hypot(toDeg(s.offset.x - base.x), toDeg(s.offset.y - base.y));
    return {
      ok: !blink && deviationDeg <= this.maxDeviationDeg,
      lost: false,
      blink,
      deviationDeg,
      distanceMm: s.distanceMm,
    };
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.landmarker?.close?.();
  }
}
