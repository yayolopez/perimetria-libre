/**
 * Sesión de perimetría estática: decide qué estímulo presentar, intercala los
 * ensayos de control (fijación, falsos positivos, falsos negativos) y registra
 * las respuestas. No sabe nada de pantallas ni de tiempos: eso lo hace el runner.
 */
import { getPattern, blindSpotLocation, eccentricity } from './patterns.js';
import { ZestStrategy } from './strategies/zest.js';
import { FullThresholdStrategy } from './strategies/fullThreshold.js';
import { SupraThresholdStrategy } from './strategies/supraThreshold.js';
import { createRng, clamp } from './math.js';

export const STRATEGIES = {
  zest: { label: 'ZEST (bayesiana, rápida)', Strategy: ZestStrategy },
  'full-threshold': { label: 'Umbral completo 4-2', Strategy: FullThresholdStrategy },
  supra: { label: 'Tamizaje supraumbral (muy rápido)', Strategy: SupraThresholdStrategy },
};

// Valor inicial del umbral foveal (se mide con el rombo de fijación).
const FOVEAL_START_DB = 33;

export const DEFAULT_CATCH_TRIALS = {
  fixation: 0.06, // estímulo en la mancha ciega (Heijl-Krakau)
  falsePositive: 0.05, // ensayo sin estímulo
  falseNegative: 0.04, // estímulo 9 dB más brillante que un umbral ya medido
  warmupTrials: 5,
};

// Punto de partida: aproximación lineal de la colina de visión. NO es normativa.
export const defaultStartDb = (point) => 33 - 0.25 * eccentricity(point);

export class PerimetrySession {
  constructor({
    patternId = '24-2',
    eye = 'OD',
    strategy = 'zest',
    range,
    seed = Date.now(),
    catchTrials = {},
    startDb = defaultStartDb,
    strategyOptions = {},
    foveal = false,
  }) {
    if (!range) throw new Error('Falta el rango del dispositivo (minDb/maxDb)');
    const entry = STRATEGIES[strategy];
    if (!entry) throw new Error(`Estrategia desconocida: ${strategy}`);

    this.config = { patternId, eye, strategy, range, seed, foveal };
    this.rng = createRng(seed);
    this.catch = { ...DEFAULT_CATCH_TRIALS, ...catchTrials };
    this.blindSpot = blindSpotLocation(eye);
    this.points = getPattern(patternId, eye);
    if (foveal) this.points.push({ id: this.points.length, x: 0, y: 0, blindSpot: false, foveal: true });
    this.states = this.points.map((point) => {
      // El umbral foveal siempre se mide con ZEST, aun en tamizaje.
      const Strategy = point.foveal ? ZestStrategy : entry.Strategy;
      const start = point.foveal ? FOVEAL_START_DB : startDb(point);
      return {
        point,
        strategy: new Strategy({
          startDb: clamp(start, range.minDb, range.maxDb),
          minDb: range.minDb,
          maxDb: range.maxDb,
          ...strategyOptions,
        }),
      };
    });

    this.log = [];
    this.pending = null;
    this.lastPointId = null;
    this.trialCount = 0;
    this.outOfWindowResponses = 0;
    this.startedAt = null;
    this.finishedAt = null;
  }

  get isComplete() {
    return this.states.every((s) => s.strategy.finished);
  }

  progress() {
    const done = this.states.filter((s) => s.strategy.finished).length;
    return { done, total: this.states.length, fraction: done / this.states.length };
  }

  nextTrial() {
    if (this.pending) throw new Error('Hay un estímulo pendiente de respuesta');
    const active = this.states.filter((s) => !s.strategy.finished);
    if (active.length === 0) {
      this.finishedAt ??= Date.now();
      return null;
    }
    this.startedAt ??= Date.now();
    const catchTrial = this.trialCount >= this.catch.warmupTrials ? this.pickCatchTrial() : null;
    this.pending = catchTrial ?? this.pickStimulusTrial(active);
    this.trialCount++;
    return this.pending;
  }

  pickCatchTrial() {
    const { fixation, falsePositive, falseNegative } = this.catch;
    const { minDb, maxDb } = this.config.range;
    const r = this.rng();

    if (r < fixation) {
      return { kind: 'fixation', x: this.blindSpot.x, y: this.blindSpot.y, db: clamp(10, minDb, maxDb) };
    }
    if (r < fixation + falsePositive) {
      return { kind: 'falsePositive', x: null, y: null, db: null };
    }
    if (r < fixation + falsePositive + falseNegative) {
      const candidates = this.states
        .filter((s) => s.strategy.finished && !s.point.blindSpot && !s.point.foveal)
        .map((s) => ({ s, res: s.strategy.result() }))
        .filter(({ res }) => res.flag === null && res.threshold - 9 >= minDb);
      if (candidates.length > 0) {
        const { s, res } = candidates[Math.floor(this.rng() * candidates.length)];
        return {
          kind: 'falseNegative',
          pointId: s.point.id,
          x: s.point.x,
          y: s.point.y,
          db: Math.round(res.threshold - 9),
        };
      }
    }
    return null;
  }

  pickStimulusTrial(active) {
    const pool = active.length > 1 ? active.filter((s) => s.point.id !== this.lastPointId) : active;
    const s = pool[Math.floor(this.rng() * pool.length)];
    return {
      kind: 'stimulus',
      pointId: s.point.id,
      x: s.point.x,
      y: s.point.y,
      foveal: Boolean(s.point.foveal),
      db: s.strategy.nextStimulus(),
    };
  }

  recordResponse(trial, { seen, responseTimeMs = null, realizedDb = null } = {}) {
    if (trial !== this.pending) throw new Error('La respuesta no corresponde al estímulo pendiente');
    this.pending = null;
    this.log.push({ ...trial, seen: Boolean(seen), responseTimeMs, realizedDb, t: Date.now() });
    if (trial.kind === 'stimulus') {
      this.states[trial.pointId].strategy.update(trial.db, Boolean(seen));
      this.lastPointId = trial.pointId;
    }
  }

  /** Descarta el estímulo pendiente (por ejemplo, si se pausó a mitad del ensayo). */
  cancelTrial() {
    this.pending = null;
  }

  recordOutOfWindowResponse() {
    this.outOfWindowResponses++;
  }
}
