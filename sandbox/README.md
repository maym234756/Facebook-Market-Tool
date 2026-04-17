# Local Sandbox

This folder is for local-only experimentation.

- `src/` remains the pulled Apps Script source of truth.
- `sandbox/current/` is disposable and can be regenerated at any time.
- Nothing in `sandbox/` is used by `clasp push`.

## Safe workflow

1. Pull the latest project into `src/`.
2. Run `npm.cmd run sandbox:refresh`.
3. Experiment in `sandbox/current/` or add local-only tests under `tests/`.
4. Move approved changes into `src/` only when you are ready.