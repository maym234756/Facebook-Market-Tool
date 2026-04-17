/** @type {import('vitest/config').UserConfig} */
module.exports = {
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js']
  }
};

/*
Professional summary:
This file configures the local test runner for the VS Code sandbox workflow. It tells Vitest to run
in a Node environment and to discover test files from the tests directory.

Operational role:
- Defines the runtime used for local tests
- Limits automatic test discovery to the intended local test suite

Why it exists:
Apps Script code is being validated locally through Node-based mocks, so the test environment must
be explicitly configured for that execution model.
*/