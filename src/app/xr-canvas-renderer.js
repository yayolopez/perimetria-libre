/**
 * Pruebas dibujadas en lienzo dentro del visor VR: un lienzo por ojo, anclado
 * a la cabeza y centrado en cada ojo, para poder mostrar imágenes distintas a
 * cada uno (estereopsis, foria, Hess).
 */
import * as THREE from 'three';
import { makeDrawContext, drawMessage } from './canvas-stage.js';
import { BaseCanvasRenderer } from './canvas-renderers.js';

const VR_DISTANCE = 2; // metros
const VR_FOV_DEG = 70; // campo cubierto por el lienzo

export class XRCanvasRenderer extends BaseCanvasRenderer {
  /** Debe llamarse dentro del clic del usuario: no hay esperas antes de abrir la sesión XR. */
  async start(session) {
    THREE.ColorManagement.enabled = false;
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local');
    renderer.domElement.style.display = 'none';
    document.body.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    const bg = session.dichoptic ? 0 : session.background ?? 0.5;
    this.scene.background = new THREE.Color(bg, bg, bg);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 100);
    this.scene.add(this.camera);

    const size = session.textureSize ?? 2048;
    const planeW = 2 * VR_DISTANCE * Math.tan(((VR_FOV_DEG / 2) * Math.PI) / 180);
    this.focalPx = size / 2 / Math.tan(((VR_FOV_DEG / 2) * Math.PI) / 180);
    const makeEye = (layer) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeW), new THREE.MeshBasicMaterial({ map: texture }));
      mesh.position.set(0, 0, -VR_DISTANCE);
      mesh.layers.set(layer);
      const rig = new THREE.Group();
      rig.add(mesh);
      this.scene.add(rig);
      return { canvas, ctx: canvas.getContext('2d'), texture, rig };
    };
    this.eyes = { left: makeEye(1), right: makeEye(2) };
    this.ipdM = 0.063;
    this.pxPerDeg = null;
    this.ppdReady = new Promise((resolve) => (this.resolvePpd = resolve));
    this.stickArmed = true;
    this.buttonState = {};

    const xr = await navigator.xr.requestSession('immersive-vr');
    xr.addEventListener('select', () => this.emit({ type: 'select' }));
    xr.addEventListener('squeeze', () => this.emit({ type: 'alt' }));
    xr.addEventListener('end', () => {
      this.sessionEnded = true;
      this.abort();
    });
    await renderer.xr.setSession(xr);
    this.xrSession = xr;
    this.last = null;
    renderer.setAnimationLoop((time, frame) => this.frame(time, frame));
  }

  /**
   * Resolución angular real del visor (píxeles por grado), a partir del campo
   * de visión de la proyección y del tamaño del framebuffer de cada ojo.
   */
  measurePxPerDeg(pose) {
    const P = pose.views[0].projectionMatrix;
    const tanLeft = (P[8] - 1) / P[0];
    const tanRight = (P[8] + 1) / P[0];
    const fovDeg = ((Math.atan(tanRight) - Math.atan(tanLeft)) * 180) / Math.PI;
    const layer = this.xrSession.renderState.baseLayer;
    const widthPx = layer ? layer.framebufferWidth / pose.views.length : 0;
    this.pxPerDeg = widthPx > 0 && fovDeg > 0 ? widthPx / fovDeg : 20;
    this.resolvePpd(this.pxPerDeg);
  }

  /** Espera la primera imagen del visor y devuelve los píxeles por grado. */
  getPxPerDeg() {
    return Promise.race([this.ppdReady, new Promise((r) => setTimeout(() => r(this.pxPerDeg ?? 20), 3000))]);
  }

  readInput() {
    let stick = { x: 0, y: 0 };
    for (const src of this.xrSession.inputSources) {
      const gp = src.gamepad;
      if (!gp) continue;
      const ax = gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] ?? 0, gp.axes[1] ?? 0];
      if (Math.hypot(ax[0], ax[1]) > Math.hypot(stick.x, stick.y)) stick = { x: ax[0], y: -ax[1] };
      // Botones A/X (4) = alternar, B/Y (5) = terminar.
      [4, 5].forEach((i) => {
        const pressed = Boolean(gp.buttons[i]?.pressed);
        const k = `${src.handedness}-${i}`;
        if (pressed && !this.buttonState[k]) this.emit({ type: i === 4 ? 'alt' : 'finish' });
        this.buttonState[k] = pressed;
      });
    }
    // La palanca genera una "dirección" al pasar de 0.7 y se rearma bajo 0.3.
    const mag = Math.hypot(stick.x, stick.y);
    if (this.stickArmed && mag > 0.7) {
      this.stickArmed = false;
      const dir = Math.abs(stick.x) > Math.abs(stick.y) ? (stick.x > 0 ? 'right' : 'left') : stick.y > 0 ? 'up' : 'down';
      this.emit({ type: 'dir', dir });
    } else if (mag < 0.3) {
      this.stickArmed = true;
    }
    return mag > 0.15 ? stick : { x: 0, y: 0 };
  }

  frame(time, frame) {
    const dt = this.last === null ? 0 : Math.min(0.1, (time - this.last) / 1000);
    this.last = time;
    const pose = frame?.getViewerPose(this.renderer.xr.getReferenceSpace());
    if (pose) {
      const o = pose.transform.orientation;
      const pos = {};
      for (const view of pose.views) {
        const eye = this.eyes[view.eye] ?? (view === pose.views[0] ? this.eyes.left : this.eyes.right);
        const p = view.transform.position;
        pos[view.eye] = p;
        eye.rig.position.set(p.x, p.y, p.z);
        eye.rig.quaternion.set(o.x, o.y, o.z, o.w);
      }
      if (!this.pxPerDeg) this.measurePxPerDeg(pose);
      if (pos.left && pos.right) {
        this.ipdM = Math.hypot(pos.left.x - pos.right.x, pos.left.y - pos.right.y, pos.left.z - pos.right.z) || this.ipdM;
      }
    }
    const stick = this.readInput();
    this.step(dt, stick);

    if (this.dirty && this.session) {
      this.dirty = false;
      for (const [name, eye] of Object.entries(this.eyes)) {
        const size = eye.canvas.width;
        const c = makeDrawContext({
          ctx: eye.ctx,
          width: size,
          height: size,
          focalPx: this.focalPx,
          eye: name,
          testedEye: this.testedEye,
          anaglyph: false,
          ipdM: this.ipdM,
          time: time / 1000,
        });
        const bg = this.session.dichoptic ? 0 : this.session.background ?? 0.5;
        c.clear(bg);
        this.session.draw(c);
        drawMessage(c, this.message);
        eye.texture.needsUpdate = true;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  async stop() {
    this.abort();
    if (this.xrSession && !this.sessionEnded) await this.xrSession.end().catch(() => {});
    this.renderer?.setAnimationLoop(null);
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
