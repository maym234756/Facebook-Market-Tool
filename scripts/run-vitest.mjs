import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const vitestEntry = path.join(projectRoot, 'node_modules', 'vitest', 'vitest.mjs');
const args = process.argv.slice(2);

const result = spawnSync(process.execPath, [vitestEntry, ...args], {
  stdio: 'inherit',
  cwd: projectRoot
});

process.exit(result.status ?? 1);

/*
Professional summary:
This script starts the local Vitest runner used to validate the sandbox and mock-based tests.
It resolves the installed test runner directly and forwards any test command arguments.

Operational role:
- Runs Vitest from the correct workspace root
- Supports both one-time and watch-mode test execution
- Preserves the test process exit code for npm scripts, tasks, and CI-style workflows

Why it exists:
The wrapper keeps test execution stable in this Windows workspace and avoids issues caused by
PowerShell execution policy or path parsing of shell-installed binaries.
*/