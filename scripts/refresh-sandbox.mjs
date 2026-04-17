import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(projectRoot, 'src');
const sandboxDir = path.join(projectRoot, 'sandbox', 'current');

if (!fs.existsSync(sourceDir)) {
  console.error('src directory not found. Run pull first.');
  process.exit(1);
}

fs.rmSync(sandboxDir, { recursive: true, force: true });
fs.mkdirSync(sandboxDir, { recursive: true });

for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
  if (!entry.isFile()) {
    continue;
  }

  const fromPath = path.join(sourceDir, entry.name);
  const toPath = path.join(sandboxDir, entry.name);
  fs.copyFileSync(fromPath, toPath);
}

console.log(`Sandbox refreshed at ${sandboxDir}`);

/*
Professional summary:
This script creates a disposable local sandbox copy of the pulled Apps Script source. It copies the
current contents of src into sandbox/current so experiments can be performed without editing the
source folder that is synced by clasp.

Operational role:
- Verifies that src exists before any sandbox work begins
- Deletes any previous sandbox snapshot to avoid stale files
- Rebuilds sandbox/current from the latest pulled source files

Why it exists:
It gives you a safe local experimentation area that does not affect the live Apps Script project
and does not change the canonical pulled source until you intentionally move changes back.
*/