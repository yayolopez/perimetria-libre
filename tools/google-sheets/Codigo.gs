/**
 * Perimetría Libre · receptor de exámenes anonimizados en Google Sheets.
 *
 * Instalación (ver docs/RECOLECCION-DATOS.md):
 *   1. Cree una hoja de cálculo nueva en Google Drive.
 *   2. Extensiones → Apps Script, borre el contenido y pegue este archivo.
 *   3. Cambie CLAVE por una clave propia (larga, sin espacios).
 *   4. Implementar → Nueva implementación → Aplicación web:
 *        Ejecutar como: Yo · Quién tiene acceso: Cualquier persona.
 *   5. Copie la URL de la aplicación web en Perimetría Libre.
 *
 * La app nunca envía nombre, ID ni observaciones del paciente; este script
 * además rechaza cualquier registro que los traiga.
 */
const CLAVE = 'CAMBIE-ESTA-CLAVE';
const HOJA = 'examenes';
const COLUMNAS = [
  'recibido', 'id', 'fecha_examen', 'version', 'tipo', 'ojo', 'edad', 'diagnostico', 'normal',
  'modo', 'perfil_luminancia', 'px_por_grado', 'resumen', 'perdidas_fijacion', 'falsos_positivos',
  'falsos_negativos', 'sitio', 'json',
];
const MAX_CELDA = 49000; // límite de Google Sheets: 50 000 caracteres por celda

function doGet() {
  return responder({ ok: true, app: 'perimetria-libre' });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder({ ok: false, error: 'formato' });
  }
  if (CLAVE === 'CAMBIE-ESTA-CLAVE') return responder({ ok: false, error: 'Configure la CLAVE en el script' });
  if (body.key !== CLAVE) return responder({ ok: false, error: 'clave' });
  if (body.ping) return responder({ ok: true, pong: true });

  const r = body.record;
  if (!r || r.app !== 'perimetria-libre' || !r.id) return responder({ ok: false, error: 'formato' });
  if (r.meta && (r.meta.patientId || r.meta.notes)) return responder({ ok: false, error: 'trae datos personales' });

  const json = JSON.stringify(r);
  if (json.length > MAX_CELDA) return responder({ ok: false, error: 'registro demasiado grande' });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const hoja = obtenerHoja();
    const n = hoja.getLastRow() - 1;
    if (n > 0) {
      const ids = hoja.getRange(2, 2, n, 1).getValues().map((f) => f[0]);
      if (ids.indexOf(r.id) >= 0) return responder({ ok: true, duplicate: true });
    }
    const m = r.meta || {};
    const rel = r.reliability || {};
    const tasa = (x) => (x && x.rate !== null && x.rate !== undefined ? Math.round(x.rate * 100) / 100 : '');
    hoja.appendRow([
      new Date(),
      r.id,
      r.createdAt || '',
      r.version || '',
      r.kind === 'test' ? r.testId : 'campimetria ' + ((r.config && r.config.patternId) || ''),
      m.eye || (r.config && r.config.eye) || '',
      m.age === null || m.age === undefined ? '' : m.age,
      m.diagnosis || '',
      m.normal ? 'sí' : '',
      m.mode || '',
      (m.profile && m.profile.name) || '',
      m.pxPerDeg || '',
      body.summary || '',
      tasa(rel.fixationLosses),
      tasa(rel.falsePositives),
      tasa(rel.falseNegatives),
      m.site || '',
      json,
    ]);
    return responder({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function obtenerHoja() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = libro.getSheetByName(HOJA);
  if (!hoja) {
    hoja = libro.insertSheet(HOJA);
    hoja.appendRow(COLUMNAS);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
