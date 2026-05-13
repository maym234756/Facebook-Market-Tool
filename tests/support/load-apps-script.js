import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

function createBaseContext(overrides = {}) {
  return {
    console,
    Set,
    Map,
    Date,
    JSON,
    Math,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Utilities: {},
    HtmlService: {
      createTemplateFromFile(name) {
        return {
          appUrl: '',
          evaluate() {
            return {
              setTitle(title) {
                return { name, title };
              }
            };
          }
        };
      },
      createHtmlOutputFromFile(name) {
        return {
          getContent() {
            return `<included:${name}>`;
          }
        };
      }
    },
    ScriptApp: {
      getService() {
        return {
          getUrl() {
            return 'https://example.test/webapp';
          }
        };
      }
    },
    ...overrides
  };
}

/**
 * @param {string[]} relativePaths
 * @param {Record<string, any>} [overrides={}]
 * @returns {Record<string, any>}
 */
export function loadAppsScriptFiles(relativePaths, overrides = {}) {
  const projectRoot = process.cwd();
  const context = createBaseContext(overrides);
  vm.createContext(context);

  for (const relativePath of relativePaths) {
    const absolutePath = path.join(projectRoot, relativePath);
    const source = fs.readFileSync(absolutePath, 'utf8');
    vm.runInContext(source, context, { filename: absolutePath });
  }

  return context;
}

/*
Professional summary:
This helper loads Apps Script source files into a Node.js virtual machine context so they can be
tested locally without executing inside Google's runtime. It also injects lightweight service mocks
for APIs such as HtmlService and ScriptApp.

Operational role:
- Creates a predictable execution context for Apps Script code under test
- Loads one or more source files from the workspace into that context
- Allows tests to override Google service objects with controlled mock implementations

Why it exists:
Apps Script code is not natively executable in Node. This loader provides the minimum compatible
runtime needed to unit test server-side logic safely in VS Code.
*/