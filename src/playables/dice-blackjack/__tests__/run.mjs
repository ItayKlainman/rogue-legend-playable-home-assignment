#!/usr/bin/env node
// Custom test runner — invokes node --test with tsx as a module loader so the
// TS test files can be executed without a build step. Adds a stub for the
// 'assets/...' webpack imports that LoadBar/BlackjackScene use (not exercised
// by the RNG/Sequence tests but imported transitively).

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../../..');

const result = spawnSync(
  'node',
  [
    '--import', 'tsx',
    '--import', resolve(__dirname, 'setup.ts'),
    '--test',
    resolve(__dirname, 'RigPolicy.test.ts'),
    resolve(__dirname, 'Sequence.test.ts'),
    resolve(__dirname, 'layout.test.ts'),
    resolve(__dirname, 'variants.test.ts'),
    resolve(__dirname, 'CoinHud.test.ts'),
  ],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env },
  },
);

process.exit(result.status ?? 1);
