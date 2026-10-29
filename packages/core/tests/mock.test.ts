import { describe, expect, it } from 'vitest';

import { generateMswHandlers, generateNodeMockServer } from '../src/index.js';
import { request } from './fixtures.js';

describe('mock & replay generator', () => {
  it('generates MSW handlers for captured requests', () => {
    const req1 = request({
      id: 'r1',
      method: 'GET',
      url: 'https://app.test/api/items',
      status: 200,
    });
    const req1b = request({
      id: 'r1b',
      method: 'GET',
      url: 'https://app.test/api/items',
      status: 200,
    });
    const reqDefaultStatus = request({
      id: 'r3',
      method: 'GET',
      url: 'https://app.test/api/default',
      status: null,
    });
    const req2 = request({
      id: 'r2',
      method: 'POST',
      url: 'https://app.test/api/orders',
      status: 201,
    });

    const mswCode = generateMswHandlers([req1, req1b, reqDefaultStatus, req2]);
    expect(mswCode).toContain("import { http, HttpResponse } from 'msw';");
    expect(mswCode).toContain("http.get('https://app.test/api/items'");
    expect(mswCode).toContain("http.post('https://app.test/api/orders'");
    expect(mswCode).toContain('status: 201');
  });

  it('generates Node.js mock HTTP server script', () => {
    const req = request({
      id: 'r1',
      method: 'GET',
      url: 'https://app.test/api/profile',
      status: 200,
    });
    const serverCode = generateNodeMockServer([req], 8080);

    expect(serverCode).toContain("import http from 'node:http';");
    expect(serverCode).toContain('8080');
    expect(serverCode).toContain('GET /api/profile');
  });
});
