import { describe, expect, it } from 'vitest';

import { toCurl, toFetch } from '../src/index.js';
import { request } from './fixtures.js';

describe('curl & fetch code generators', () => {
  it('generates curl for simple GET request', () => {
    const req = request({ url: 'https://app.test/api/items' });
    expect(toCurl(req)).toBe('curl "https://app.test/api/items"');
  });

  it('generates curl with custom method for POST request', () => {
    const req = request({ method: 'POST', url: 'https://app.test/api/orders' });
    expect(toCurl(req)).toContain('-X POST');
    expect(toCurl(req)).toContain('"https://app.test/api/orders"');
  });

  it('generates fetch snippet for GET and POST', () => {
    const reqGet = request({ url: 'https://app.test/api/items' });
    expect(toFetch(reqGet)).toBe('await fetch("https://app.test/api/items");');

    const reqPost = request({ method: 'POST', url: 'https://app.test/api/items' });
    expect(toFetch(reqPost)).toContain('method: "POST"');
  });

  it('includes body placeholder when request body was captured', () => {
    const req = request({
      method: 'POST',
      url: 'https://app.test/api/items',
      body: { kind: 'text', text: '{"key":"value"}', contentType: 'application/json' },
    });
    expect(toCurl(req)).toContain('--data "[BODY_REDACTED]"');
  });
});
