#!/usr/bin/env node
// Test runner for @shared modules. Uses tsx as a loader and reuses the
// dice-blackjack rAF polyfill (a generic test shim) so PixiJS Ticker — which the
// SceneManager crossfade tween drives — advances under node.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');
const SETUP = resolve(__dirname, '../../playables/dice-blackjack/__tests__/setup.ts');

const result = spawnSync(
  'node',
  ['--import', 'tsx', '--import', SETUP, '--test',
    resolve(__dirname, 'SceneManager.test.ts'),
    resolve(__dirname, '../viewport.test.ts')],
  { cwd: ROOT, stdio: 'inherit', env: { ...process.env } },
);

process.exit(result.status ?? 1);
