#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Entrypoint wrapper that executes tools/bulk-test.ts using Node's native TypeScript support
 * (or tsx when invoked directly via npx tsx tools/bulk-test.ts).
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(__dirname, 'bulk-test.ts');

const res = spawnSync(
  process.execPath,
  ['--experimental-transform-types', '--no-warnings', scriptPath, ...process.argv.slice(2)],
  { stdio: 'inherit' }
);

process.exit(res.status ?? 1);

