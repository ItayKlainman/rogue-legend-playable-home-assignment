#!/usr/bin/env node
// Custom test runner — invokes node --test with tsx as a module loader so the
// TS test files can be executed without a build step. eventPolicy is an
// asset-free, Pixi-free module (type-only import of PlayableEvent is erased by
// tsx/esbuild), so no rAF/asset stub setup is needed here.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../../..');

const result = spawnSync(
  'node',
  [
    '--import', 'tsx',
    '--test',
    resolve(__dirname, 'eventPolicy.test.ts'),
    resolve(__dirname, 'codegen.test.ts'),
  ],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env },
  },
);

process.exit(result.status ?? 1);
