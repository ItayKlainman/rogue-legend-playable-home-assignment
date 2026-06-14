#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../../..');

const testFiles = readdirSync(__dirname)
  .filter(f => f.endsWith('.test.ts'))
  .map(f => resolve(__dirname, f));

const result = spawnSync(
  'node',
  ['--import', 'tsx', '--import', resolve(__dirname, 'setup.ts'), '--test', ...testFiles],
  { cwd: ROOT, stdio: 'inherit', env: { ...process.env } },
);

process.exit(result.status ?? 1);
