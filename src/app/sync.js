/**
 * Envío de exámenes anonimizados a una hoja de Google Sheets (Apps Script).
 *
 * Los exámenes con consentimiento entran en una cola local; se envían en
 * cuanto hay conexión y se marcan como enviados. Si falla, se reintentan al
 * volver la conexión o al abrir la app. El script rechaza duplicados.
 */
import { anonymize, isShareable } from '../core/anonymize.js';
import * as store from './storage.js';

const OUTBOX_KEY = 'pl.outbox.v1';

function readOutbox() {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function writeOutbox(ids) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // sin almacenamiento: no hay cola, pero tampoco se pierde el examen guardado
  }
}

export const syncSettings = () => store.loadPrefs().sync ?? { url: '', key: '', site: '', auto: true };

export function saveSyncSettings(settings) {
  store.savePrefs({ ...store.loadPrefs(), sync: settings });
}

export const isConfigured = () => {
  const s = syncSettings();
  return Boolean(s.url && s.key);
};

export const pendingCount = () => readOutbox().length;

/** Agrega un examen guardado a la cola, si corresponde. */
export function enqueue(result) {
  if (!result?.id || !isShareable(result) || result.meta.uploadedAt) return false;
  writeOutbox([...readOutbox(), result.id]);
  return true;
}

/** Resumen de una línea para la hoja de cálculo. */
function rowSummary(result, testById) {
  if (result.kind === 'test') return testById(result.testId)?.summary(result.data) ?? '';
  const ms = result.stats?.meanSensitivity;
  return ms == null ? '' : `MS ${ms.toFixed(1)} dB`;
}

async function post(url, payload) {
  // text/plain evita la consulta previa CORS que Apps Script no responde.
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => null);
  if (!data) throw new Error(`Respuesta inválida del servidor (${res.status})`);
  return data;
}

export async function testConnection() {
  const { url, key } = syncSettings();
  if (!url) throw new Error('Falta la dirección del script');
  const data = await post(url, { key, ping: true });
  if (!data.ok) throw new Error(data.error === 'clave' ? 'La clave no coincide con la del script' : data.error ?? 'Error del servidor');
  return data;
}

let flushing = null;

/** Envía todo lo pendiente. Devuelve { sent, failed, lastError }. */
export function flush(testById) {
  flushing ??= (async () => {
    const { url, key, site } = syncSettings();
    const out = { sent: 0, failed: 0, lastError: null };
    if (!url || !key || !navigator.onLine) return out;
    for (const id of readOutbox()) {
      const result = store.getResult(id);
      if (!result || !isShareable(result)) {
        writeOutbox(readOutbox().filter((x) => x !== id));
        continue;
      }
      try {
        const data = await post(url, { key, record: anonymize(result, { site }), summary: rowSummary(result, testById) });
        if (!data.ok) throw new Error(data.error ?? 'rechazado');
        store.updateResult(id, { meta: { uploadedAt: new Date().toISOString() } });
        writeOutbox(readOutbox().filter((x) => x !== id));
        out.sent++;
      } catch (err) {
        out.failed++;
        out.lastError = err.message;
        if (err instanceof TypeError) break; // sin red: se reintenta después
      }
    }
    return out;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/**
 * Enlace que configura otro equipo (por ejemplo el visor) con un solo toque.
 * Va en el fragmento (#), que el navegador no envía a ningún servidor.
 */
export function configLink(baseUrl) {
  const s = syncSettings();
  const data = btoa(unescape(encodeURIComponent(JSON.stringify({ url: s.url, key: s.key, site: s.site }))));
  return `${baseUrl.split('#')[0]}#config=${data}`;
}

/** Lee la configuración del enlace, si viene en la dirección. Devuelve true si la aplicó. */
export function applyConfigFromLocation() {
  const m = location.hash.match(/config=([^&]+)/);
  if (!m) return false;
  try {
    const cfg = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    if (cfg.url && cfg.key) saveSyncSettings({ ...syncSettings(), ...cfg, auto: true });
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  } catch {
    return false;
  }
}
