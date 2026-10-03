/** Mini arnés de pruebas que corre igual en el navegador y en Node (sin dependencias). */
const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export const assert = {
  ok(cond, msg = 'se esperaba verdadero') {
    if (!cond) throw new Error(msg);
  },
  equal(actual, expected, msg = '') {
    if (actual !== expected) throw new Error(`${msg} esperado ${expected}, obtenido ${actual}`);
  },
  approx(actual, expected, tol, msg = '') {
    if (Math.abs(actual - expected) > tol) {
      throw new Error(`${msg} esperado ${expected} ± ${tol}, obtenido ${actual}`);
    }
  },
  throws(fn, msg = 'se esperaba una excepción') {
    try {
      fn();
    } catch {
      return;
    }
    throw new Error(msg);
  },
};

export async function run(log = console.log) {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      log(`✔ ${name}`, true);
    } catch (err) {
      failed++;
      log(`✘ ${name}: ${err.message}`, false);
    }
  }
  log(`${tests.length - failed}/${tests.length} pruebas correctas`, failed === 0);
  return failed;
}
