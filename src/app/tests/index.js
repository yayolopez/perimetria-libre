/** Pruebas adicionales disponibles, en el orden en que se muestran. */
import acuity from './acuity.js';
import contrast from './contrast.js';
import amsler from './amsler.js';
import stereo from './stereo.js';
import color from './color.js';
import phoria from './phoria.js';
import hess from './hess.js';

export const TESTS = [acuity, contrast, amsler, stereo, color, phoria, hess];
export const testById = (id) => TESTS.find((t) => t.id === id);
