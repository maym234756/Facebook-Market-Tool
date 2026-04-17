# Apps Script VS Code Workflow

This folder is connected to the Apps Script project with script ID `18AjZ9F6SFsmrjriynpru_CM9qk0ahuW5BwY1EfwA49p3OelDSy2p_tPG`.

## First-time setup

1. Install dependencies:

   ```powershell
   npm.cmd install
   ```

2. Log in to Google for `clasp`:

   ```powershell
   npm.cmd run login
   ```

3. Pull the current Apps Script files into `src/`:

   ```powershell
   npm.cmd run pull
   ```

## Daily workflow

- Pull latest remote changes:

  ```powershell
  npm.cmd run pull
  ```

- Run local checks:

  ```powershell
  npm.cmd run check
  ```

- Refresh a disposable local sandbox copy of the pulled Apps Script files:

  ```powershell
  npm.cmd run sandbox:refresh
  ```

- Push your local edits back to Apps Script:

  ```powershell
  npm.cmd run push
  ```

- Watch local changes and auto-push to the Apps Script sandbox:

  ```powershell
  npm.cmd run push:watch
  ```

- Open the Apps Script project in your browser:

  ```powershell
  npm.cmd run open
  ```

## Notes

- `src/` is the folder synced by `clasp`.
- `sandbox/current/` is a disposable local copy for experimentation. It is never pushed by `clasp`.
- `tests/` is local-only and is not pushed to Apps Script.
- `build` runs the local validation pipeline before you push.
- `typecheck` validates local `.js` files and your test files using Apps Script types.