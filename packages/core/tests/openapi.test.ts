import { describe, expect, it } from 'vitest';

import { validateOpenApi, type OpenApiSpec } from '../src/index.js';
import { request } from './fixtures.js';

describe('OpenAPI / Swagger spec validation', () => {
  const sampleSpec: OpenApiSpec = {
    openapi: '3.0.0',
    paths: {
      '/api/items': {
        get: { summary: 'List items' },
      },
      '/api/items/{id}': {
        get: { summary: 'Get item' },
        put: { summary: 'Update item' },
      },
    },
  };

  it('passes requests that match documented paths and methods', () => {
    const req1 = request({ method: 'GET', url: 'https://app.test/api/items' });
    const req2 = request({ method: 'GET', url: 'https://app.test/api/items/42' });
    const req3 = request({ method: 'PUT', url: 'https://app.test/api/items/42' });

    const findings = validateOpenApi([req1, req2, req3], sampleSpec);
    expect(findings).toEqual([]);
  });

  it('reports undocumented endpoint when request path is missing from spec', () => {
    const req = request({ method: 'GET', url: 'https://app.test/api/unknown-endpoint' });
    const findings = validateOpenApi([req], sampleSpec);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.type).toBe('undocumented-endpoint');
    expect(findings[0]?.severity).toBe('low');
    expect(findings[0]?.reasoning).toContain('does not match any path defined');
  });

  it('reports method-not-allowed when path exists but method is unsupported', () => {
    const req = request({ method: 'DELETE', url: 'https://app.test/api/items/42' });
    const findings = validateOpenApi([req], sampleSpec);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.type).toBe('undocumented-endpoint');
    expect(findings[0]?.severity).toBe('medium');
    expect(findings[0]?.reasoning).toContain('does not allow DELETE');
  });

  it('handles empty or non-object paths gracefully', () => {
    const req = request({ method: 'GET', url: 'https://app.test/api/items' });
    expect(validateOpenApi([req], { paths: {} })).toHaveLength(1);
    expect(validateOpenApi([req], { paths: null } as unknown as OpenApiSpec)).toEqual([]);
  });
});
