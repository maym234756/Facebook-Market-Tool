import { describe, expect, it } from 'vitest';
import { loadAppsScriptFiles } from './support/load-apps-script.js';

describe('Apps Script sandbox harness', () => {
  it('loads Code.js without editing src', () => {
    const context = loadAppsScriptFiles(['src/Code.js']);

    expect(typeof context.getRegions).toBe('function');
    expect(context.getRegions()).toEqual([
      'OMG',
      'Texas (North)',
      'Texas (South)'
    ]);
  });

  it('evaluates doGet with mocked Apps Script services', () => {
    const context = loadAppsScriptFiles(['src/Code.js']);
    const result = context.doGet({ parameter: { page: 'manager' } });

    expect(result).toEqual({
      name: 'Manager',
      title: 'PBC/OMG Facebook Listings App'
    });
  });
});

/*
Professional summary:
This test file verifies that the local Apps Script loader works and that the pulled Code.js file
can be executed in the sandbox context without modifying src. It focuses on basic runtime loading
and routing behavior.

Operational role:
- Confirms that Code.js loads correctly inside the local VM harness
- Verifies that exposed functions are available after loading
- Validates one representative doGet routing scenario using mocked Apps Script services

Why it exists:
It acts as the first confidence check that the local sandbox is wired correctly before deeper
business-logic tests are added.
*/