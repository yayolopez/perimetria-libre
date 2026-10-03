/**
 * Enlace entre el equipo del examen y el monitor del operador.
 *
 * - Mismo equipo (otra ventana o segundo monitor): BroadcastChannel, sin red.
 * - Otro equipo (tablet o PC del operador mirando un examen en el visor):
 *   WebRTC con PeerJS. El servidor público de PeerJS solo sirve para que los
 *   dos equipos se encuentren con un código de 6 dígitos; los datos del examen
 *   viajan cifrados directamente entre ellos.
 */
const CHANNEL = 'perimetria-libre-monitor';
const PEER_PREFIX = 'perimetria-libre-';
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';

let peerJsPromise = null;
function loadPeerJs() {
  if (window.Peer) return Promise.resolve(window.Peer);
  peerJsPromise ??= new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement('script'), { src: PEERJS_URL, async: true });
    script.onload = () => resolve(window.Peer);
    script.onerror = () => reject(new Error('No se pudo cargar PeerJS (¿sin conexión a internet?)'));
    document.head.appendChild(script);
  });
  return peerJsPromise;
}

/** Lado del examen: difunde el estado y recibe órdenes del operador. */
export class MonitorHost {
  constructor({ onCommand }) {
    this.onCommand = onCommand;
    this.conns = new Set();
    this.snapshot = {}; // último mensaje de cada tipo, para monitores que se conectan tarde
    if ('BroadcastChannel' in window) {
      this.bc = new BroadcastChannel(CHANNEL);
      this.bc.onmessage = (e) => this.handleCommand(e.data, (msg) => this.bc.postMessage(msg));
    }
  }

  handleCommand(data, reply) {
    if (!data?.cmd) return;
    if (data.cmd === 'sync') {
      Object.values(this.snapshot).forEach(reply);
      return;
    }
    this.onCommand(data.cmd);
  }

  /** Habilita el monitor remoto y devuelve el código de 6 dígitos. */
  async enableRemote() {
    const Peer = await loadPeerJs();
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      try {
        this.peer = await new Promise((resolve, reject) => {
          const peer = new Peer(PEER_PREFIX + code);
          peer.on('open', () => resolve(peer));
          peer.on('error', (err) => reject(err));
        });
        this.code = code;
        break;
      } catch (err) {
        if (err?.type !== 'unavailable-id' || attempt === 2) throw err;
      }
    }
    this.peer.on('connection', (conn) => {
      conn.on('open', () => {
        this.conns.add(conn);
        Object.values(this.snapshot).forEach((m) => conn.send(m));
      });
      conn.on('data', (data) => this.handleCommand(data, (msg) => conn.send(msg)));
      conn.on('close', () => this.conns.delete(conn));
    });
    return this.code;
  }

  send(msg) {
    // El resultado completo no se guarda: solo se envía una vez al terminar.
    if (msg.type !== 'trial' && msg.type !== 'result') this.snapshot[msg.type] = msg;
    if (msg.type === 'trial') this.snapshot.lastTrial = msg;
    this.bc?.postMessage(msg);
    for (const conn of this.conns) if (conn.open) conn.send(msg);
  }

  close() {
    this.bc?.close();
    setTimeout(() => this.peer?.destroy(), 1500); // deja salir el último mensaje
  }
}

/** Lado del operador. */
export class MonitorClient {
  constructor({ onMessage, onStatus }) {
    this.onMessage = onMessage;
    this.onStatus = onStatus ?? (() => {});
  }

  connectLocal() {
    this.disconnect();
    this.bc = new BroadcastChannel(CHANNEL);
    this.bc.onmessage = (e) => e.data?.type && this.onMessage(e.data);
    this.bc.postMessage({ cmd: 'sync' });
    this.onStatus('Escuchando exámenes en este equipo…');
  }

  async connectRemote(code) {
    this.disconnect();
    this.onStatus('Conectando…');
    const Peer = await loadPeerJs();
    this.peer = new Peer();
    await new Promise((resolve, reject) => {
      this.peer.on('open', resolve);
      this.peer.on('error', reject);
    });
    this.conn = this.peer.connect(PEER_PREFIX + code.trim(), { reliable: true });
    this.conn.on('open', () => this.onStatus(`Conectado al examen ${code}`));
    this.conn.on('data', (msg) => msg?.type && this.onMessage(msg));
    this.conn.on('close', () => this.onStatus('Conexión cerrada'));
    this.peer.on('error', (err) => this.onStatus(`Error de conexión: ${err.type ?? err.message}`));
  }

  send(cmd) {
    this.bc?.postMessage({ cmd });
    if (this.conn?.open) this.conn.send({ cmd });
  }

  disconnect() {
    this.bc?.close();
    this.bc = null;
    this.peer?.destroy();
    this.peer = null;
    this.conn = null;
  }
}
