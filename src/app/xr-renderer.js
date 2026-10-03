/**
 * Presentación en visor VR mediante WebXR (Pico, Meta Quest, Vision Pro,
 * Android + Cardboard...). Los estímulos se dibujan solo en el ojo examinado
 * y se anclan a la cabeza, centrados en la posición de ese ojo, de modo que
 * mover la cabeza no cambia su ubicación en el campo visual.
 */
import * as THREE from 'three';
import { TimedPresenter } from './timed-presenter.js';

const DISTANCE = 3; // metros
const LEFT_EYE_LAYER = 1; // capas que three.js asigna a cada ojo en WebXR
const RIGHT_EYE_LAYER = 2;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Ubica un objeto a (x°, y°) del eje visual, de frente al observador. */
function placeOnSphere(obj, xDeg, yDeg, distance = DISTANCE) {
  const az = toRad(xDeg);
  const el = toRad(yDeg);
  obj.position.set(
    distance * Math.cos(el) * Math.sin(az),
    distance * Math.sin(el),
    -distance * Math.cos(el) * Math.cos(az),
  );
  obj.rotation.set(el, -az, 0, 'YXZ');
}

function makeLabel() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.4),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
  );
  mesh.visible = false;

  const setText = (text) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!text) {
      mesh.visible = false;
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, 32);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '600 52px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      ctx.fillText(line, canvas.width / 2, canvas.height / 2 + (i - (lines.length - 1) / 2) * 64);
    });
    texture.needsUpdate = true;
    mesh.visible = true;
  };
  return { mesh, setText };
}

export class XRPerimeterRenderer {
  static async isSupported() {
    if (!navigator.xr) return false;
    return navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  }

  constructor({ eye = 'OD', display, stimulusSizeDeg = 0.43 }) {
    this.eyeName = eye === 'OI' ? 'left' : 'right';
    this.eyeLayer = eye === 'OI' ? LEFT_EYE_LAYER : RIGHT_EYE_LAYER;
    this.display = display;
    this.stimulusSizeDeg = stimulusSizeDeg;
    this.presenter = new TimedPresenter();
    this.selectResolver = null;
    this.ended = false;
    this.sessionEnded = false;
    this.onResponse = null;
    this.onPause = null;
    this.onEnd = null;
  }

  /** Debe llamarse desde un gesto del usuario (clic) para poder abrir la sesión XR. */
  async start() {
    THREE.ColorManagement.enabled = false;
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    // Sin conversiones de color: el valor que escribimos es el código que llega al panel.
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local');
    renderer.domElement.style.display = 'none';
    document.body.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.setBackground(this.display.backgroundValue);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 100);
    this.scene.add(this.camera);

    this.rig = new THREE.Group();
    this.scene.add(this.rig);

    const stimRadius = DISTANCE * Math.tan(toRad(this.stimulusSizeDeg / 2));
    this.stimulus = new THREE.Mesh(
      new THREE.CircleGeometry(stimRadius, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    this.stimulus.layers.set(this.eyeLayer);
    this.stimulus.visible = false;
    this.rig.add(this.stimulus);

    this.fixations = this.buildFixationTargets();
    Object.values(this.fixations).forEach((obj) => this.rig.add(obj));
    this.setFixation('dot');

    this.label = makeLabel();
    placeOnSphere(this.label.mesh, 0, 8);
    this.rig.add(this.label.mesh);

    const session = await navigator.xr.requestSession('immersive-vr');
    session.addEventListener('select', () => this.handleSelect(performance.now()));
    session.addEventListener('squeeze', () => this.onPause?.());
    session.addEventListener('end', () => this.handleEnd());
    await renderer.xr.setSession(session);
    this.session = session;
    renderer.setAnimationLoop((time, frame) => this.frame(time, frame));
  }

  /** Punto, rombo (4 puntos a 2°) o cruz, en un gris oscuro sobre el fondo. */
  buildFixationTargets() {
    const v = this.display.backgroundValue * 0.25;
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v, v) });
    const disc = (diameterDeg) => new THREE.CircleGeometry(DISTANCE * Math.tan(toRad(diameterDeg / 2)), 32);

    const dot = new THREE.Mesh(disc(0.3), material);
    placeOnSphere(dot, 0, 0);

    const diamond = new THREE.Group();
    for (const [x, y] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const m = new THREE.Mesh(disc(0.3), material);
      placeOnSphere(m, x, y);
      diamond.add(m);
    }

    const cross = new THREE.Group();
    const len = DISTANCE * Math.tan(toRad(1.5));
    const thick = DISTANCE * Math.tan(toRad(0.12));
    for (const [w, h] of [[len, thick], [thick, len]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
      placeOnSphere(m, 0, 0);
      cross.add(m);
    }
    return { dot, diamond, cross };
  }

  setFixation(type) {
    for (const [name, obj] of Object.entries(this.fixations ?? {})) obj.visible = name === type;
  }

  frame(time, frame) {
    const pose = frame?.getViewerPose(this.renderer.xr.getReferenceSpace());
    if (pose) {
      const view = pose.views.find((v) => v.eye === this.eyeName) ?? pose.views[0];
      const p = view.transform.position;
      const o = pose.transform.orientation;
      this.rig.position.set(p.x, p.y, p.z);
      this.rig.quaternion.set(o.x, o.y, o.z, o.w);
    }

    const stim = this.presenter.tick(time);
    if (stim) {
      placeOnSphere(this.stimulus, stim.x, stim.y);
      this.stimulus.material.color.setRGB(stim.value, stim.value, stim.value);
    }
    this.stimulus.visible = Boolean(stim);
    this.renderer.render(this.scene, this.camera);
  }

  handleSelect(time) {
    if (this.selectResolver) {
      const resolve = this.selectResolver;
      this.selectResolver = null;
      resolve(time);
    } else {
      this.onResponse?.(time);
    }
  }

  /** La sesión XR terminó (el usuario salió o el sistema la cerró). */
  handleEnd() {
    this.sessionEnded = true;
    this.abort();
    this.onEnd?.();
  }

  /** Interrumpe esperas y estímulos pendientes. */
  abort() {
    this.ended = true;
    this.presenter.cancel();
    this.selectResolver?.(null);
    this.selectResolver = null;
  }

  cancelWait() {
    this.selectResolver = null;
  }

  setBackground(value) {
    this.scene.background = new THREE.Color(value, value, value);
  }

  present(stimulus, durationMs) {
    if (this.ended) return Promise.resolve(null);
    return this.presenter.present(stimulus, durationMs);
  }

  waitForSelect() {
    if (this.ended) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.selectResolver = resolve;
    });
  }

  showMessage(text) {
    placeOnSphere(this.label.mesh, 0, 8);
    this.label.setText(text);
  }

  /** Campo uniforme para medir con fotómetro durante la calibración. */
  showField(value, text) {
    this.setFixation(null);
    this.setBackground(value);
    placeOnSphere(this.label.mesh, 0, -22);
    this.label.setText(text);
  }

  async stop() {
    this.presenter.cancel();
    if (this.session && !this.sessionEnded) await this.session.end().catch(() => {});
    this.renderer?.setAnimationLoop(null);
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
