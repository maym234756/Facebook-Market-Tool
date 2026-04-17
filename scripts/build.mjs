import { spawnSync } from 'node:child_process';

const run = (scriptPath, args = []) => {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    stdio: 'inherit',
    cwd: process.cwd()
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run('scripts/run-tsc.mjs', ['--noEmit']);
run('scripts/run-vitest.mjs', ['run']);

/*
Professional summary:
This file is the local validation entry point for the VS Code workflow. It runs the project's
type-check step first and then runs the automated test suite. The script is intentionally small
so the package.json build command has a single reliable coordinator.

Operational role:
- Executes the TypeScript validator against the local workspace
- Executes the Vitest test suite after type-checking succeeds
- Stops immediately if either child process fails

Why it exists:
This wrapper avoids fragile shell chaining and makes the build process dependable on Windows,
including this workspace path, which contains special characters.
*/