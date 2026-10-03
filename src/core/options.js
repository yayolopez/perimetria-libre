/** Opciones configurables del examen (valores por defecto = estándar clínico). */

// Diámetro en grados de los tamaños de Goldmann.
export const GOLDMANN_SIZES = {
  I: { label: 'I · 0.11°', deg: 0.108 },
  II: { label: 'II · 0.22°', deg: 0.215 },
  III: { label: 'III · 0.43° (estándar)', deg: 0.431 },
  IV: { label: 'IV · 0.86°', deg: 0.862 },
  V: { label: 'V · 1.72° (baja visión)', deg: 1.724 },
};

export const SPEEDS = {
  normal: { label: 'Normal', responseWindowMs: 1500, isiMinMs: 400, isiMaxMs: 1000 },
  lenta: { label: 'Lenta (adultos mayores)', responseWindowMs: 2000, isiMinMs: 700, isiMaxMs: 1500 },
  rapida: { label: 'Rápida', responseWindowMs: 1200, isiMinMs: 300, isiMaxMs: 700 },
};

export const DURATIONS_MS = [100, 200, 300];

export const FIXATION_TARGETS = {
  dot: 'Punto central',
  diamond: 'Rombo (escotoma central)',
  cross: 'Cruz grande',
};

export const CATCH_PRESETS = {
  estandar: { label: 'Estándar', fixation: 0.06, falsePositive: 0.05, falseNegative: 0.04 },
  frecuentes: { label: 'Más frecuentes', fixation: 0.1, falsePositive: 0.08, falseNegative: 0.06 },
  pocos: { label: 'Menos frecuentes (más rápido)', fixation: 0.03, falsePositive: 0.03, falseNegative: 0.02 },
};

export const DEFAULT_OPTIONS = {
  size: 'III',
  durationMs: 200,
  speed: 'normal',
  fixation: 'dot',
  catchPreset: 'estandar',
  foveal: false,
  sound: true,
  gaze: false,
  remoteMonitor: false,
};
