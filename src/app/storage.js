/**
 * Almacenamiento local en el navegador del equipo. Los datos no salen del
 * dispositivo; para respaldarlos o pasarlos a otro equipo use "Exportar".
 */
const KEYS = {
  results: 'pl.results.v1',
  profiles: 'pl.profiles.v1',
  prefs: 'pl.prefs.v1',
  normatives: 'pl.normatives.v1',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const listResults = () => read(KEYS.results, []);
export const getResult = (id) => listResults().find((r) => r.id === id);

export function saveResult(result) {
  const stored = { id: newId(), ...result };
  const ok = write(KEYS.results, [stored, ...listResults()]);
  return ok ? stored : null;
}

export function updateResult(id, changes) {
  const all = listResults();
  const i = all.findIndex((r) => r.id === id);
  if (i < 0) return null;
  all[i] = { ...all[i], ...changes, meta: { ...all[i].meta, ...(changes.meta ?? {}) } };
  return write(KEYS.results, all) ? all[i] : null;
}

export const deleteResult = (id) => write(KEYS.results, listResults().filter((r) => r.id !== id));

export const listProfiles = () => read(KEYS.profiles, []);
export const saveProfile = (profile) =>
  write(KEYS.profiles, [...listProfiles().filter((p) => p.id !== profile.id), profile]);
export const deleteProfile = (id) => write(KEYS.profiles, listProfiles().filter((p) => p.id !== id));

export const loadPrefs = () => read(KEYS.prefs, {});
export const savePrefs = (prefs) => write(KEYS.prefs, prefs);

export const listNormatives = () => read(KEYS.normatives, []);
export const saveNormative = (norm) =>
  write(KEYS.normatives, [...listNormatives().filter((n) => n.id !== norm.id), norm]);
export const deleteNormative = (id) => write(KEYS.normatives, listNormatives().filter((n) => n.id !== id));
