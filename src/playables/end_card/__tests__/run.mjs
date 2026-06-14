#!/usr/bin/env node
// Custom test runner for the end_card module — invokes `node --test` with tsx as
// a loader so the TS test executes without a build step. The convex-button tests
// are asset-free (the texture/border are passed in), so no asset stubs are needed.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../../..');

const result = spawnSync(
  'node',
  ['--import', 'tsx', '--test', resolve(__dirname, 'convexButton.test.ts')],
  { cwd: ROOT, stdio: 'inherit', env: { ...process.env } },
);

process.exit(result.status ?? 1);
