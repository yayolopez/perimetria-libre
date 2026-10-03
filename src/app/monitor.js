/** Página del monitor del operador. */
import { MonitorClient } from './monitor-link.js';
import { MonitorView } from './monitor-view.js';
import { renderReport } from './report.js';
import { analyse, normativeMatches } from '../core/normative.js';
import * as store from './storage.js';

const $ = (sel) => document.querySelector(sel);
let received = null;

const view = new MonitorView($('#monitor'), {
  onCommand: (cmd) => client.send(cmd),
  onResult: (result) => {
    received = result;
    const norm = store.listNormatives().find((n) => normativeMatches(n, result));
    $('#result').innerHTML = renderReport(result, norm ? analyse(result, norm) : null);
    $('#result-card').hidden = false;
    $('#save-result').disabled = false;
    $('#result-card').scrollIntoView({ behavior: 'smooth' });
  },
});

const client = new MonitorClient({
  onMessage: (msg) => view.handle(msg),
  onStatus: (text) => ($('#conn-status').textContent = text),
});

$('#connect-local').addEventListener('click', () => client.connectLocal());
$('#remote-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('#remote-code').value.trim();
  if (!/^\d{6}$/.test(code)) {
    $('#conn-status').textContent = 'El código tiene 6 dígitos.';
    return;
  }
  try {
    await client.connectRemote(code);
  } catch (err) {
    $('#conn-status').textContent = `No se pudo conectar: ${err.type ?? err.message}`;
  }
});

$('#save-result').addEventListener('click', () => {
  if (!received) return;
  const ok = store.listResults().some((r) => r.id === received.id) || store.saveResult(received);
  $('#save-result').disabled = true;
  $('#save-result').textContent = ok ? 'Guardado' : 'No se pudo guardar';
});
$('#print-result').addEventListener('click', () => window.print());

// Si se abre desde la misma app, escucha este equipo de inmediato.
client.connectLocal();
