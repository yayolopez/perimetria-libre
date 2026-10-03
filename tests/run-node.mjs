// Uso: node tests/run-node.mjs
import { run } from './harness.js';
import './core.test.js';
import './v2.test.js';
import './v3.test.js';

const failed = await run();
process.exit(failed ? 1 : 0);
