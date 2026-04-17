import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const claspEntry = path.join(projectRoot, 'node_modules', '@google', 'clasp', 'build', 'src', 'index.js');
const args = process.argv.slice(2);

const result = spawnSync(process.execPath, [claspEntry, ...args], {
  stdio: 'inherit',
  cwd: projectRoot
});

process.exit(result.status ?? 1);

/*
Professional summary:
This script is the local bridge between VS Code and Google Apps Script via clasp. It resolves the
installed clasp CLI directly from node_modules and runs it with the current command-line arguments.

Operational role:
- Provides a stable local entry point for pull, push, login, open, and deploy commands
- Forces execution from the correct project root so clasp reads the intended .clasp.json file
- Preserves clasp's exit code so VS Code tasks and npm scripts can react correctly

Why it exists:
Directly calling clasp through shell-resolved binaries can fail in Windows paths that include
special characters. This wrapper removes that fragility and makes the sync workflow predictable.
*/