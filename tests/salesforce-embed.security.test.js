import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadAppsScriptFiles } from './support/load-apps-script.js';

const EMBED_SECRET = 'shared-secret';

function createContext() {
  return loadAppsScriptFiles(['src/Code.js'], {
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(name) {
            return name === 'SALESFORCE_EMBED_SECRET' ? EMBED_SECRET : '';
          }
        };
      }
    },
    Utilities: {
      computeHmacSha256Signature(value, key) {
        return Array.from(crypto.createHmac('sha256', key).update(value).digest());
      }
    },
    HtmlService: {
      XFrameOptionsMode: {
        ALLOWALL: 'ALLOWALL'
      },
      createTemplateFromFile(name) {
        return {
          appUrl: '',
          evaluate() {
            return {
              name,
              title: null,
              mode: null,
              setTitle(title) {
                this.title = title;
                return this;
              },
              setXFrameOptionsMode(mode) {
                this.mode = mode;
                return this;
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
    }
  });
}

function createSignedRequest(context, overrides = {}) {
  const page = overrides.page || 'index';
  const expires = overrides.expires || Date.now() + 60_000;
  const sig = overrides.sig || context.createSalesforceEmbedSignature_(page, expires, EMBED_SECRET);

  return {
    parameter: {
      page,
      embed: 'salesforce',
      expires: String(expires),
      sig
    }
  };
}

describe('Salesforce embed security', () => {
  it('allows a valid signed Salesforce embed request', () => {
    const context = createContext();

    const output = context.doGet(createSignedRequest(context, { page: 'listings' }));

    expect(output.name).toBe('Listings');
    expect(output.mode).toBe('ALLOWALL');
    expect(output.title).toBe('PBC/OMG Facebook Listings App');
  });

  it('rejects an expired Salesforce embed token', () => {
    const context = createContext();

    expect(() => {
      context.doGet(createSignedRequest(context, { expires: Date.now() - 1_000 }));
    }).toThrow('Expired Salesforce embed token.');
  });

  it('rejects an invalid Salesforce embed signature', () => {
    const context = createContext();

    expect(() => {
      context.doGet(createSignedRequest(context, { sig: 'bad-signature' }));
    }).toThrow('Invalid Salesforce embed token.');
  });

  it('keeps the normal app route outside iframe mode', () => {
    const context = createContext();

    const output = context.doGet({ parameter: { page: 'analytics' } });

    expect(output.name).toBe('Analytics');
    expect(output.mode).toBeNull();
  });
});