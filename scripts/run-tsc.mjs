import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const tscEntry = path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const args = process.argv.slice(2);

const result = spawnSync(process.execPath, [tscEntry, ...args], {
  stdio: 'inherit',
  cwd: projectRoot
});

process.exit(result.status ?? 1);

/*
Professional summary:
This script launches the project's local TypeScript compiler in a controlled way. It is used for
static validation of JavaScript test files and any other files covered by tsconfig.json.

Operational role:
- Resolves the local TypeScript compiler from node_modules
- Runs the compiler from the workspace root with any forwarded arguments
- Returns the compiler exit status unchanged to the calling task or npm script

Why it exists:
It provides a shell-independent way to execute TypeScript consistently across this workspace,
especially on Windows PowerShell where direct binary resolution can be unreliable.
*/