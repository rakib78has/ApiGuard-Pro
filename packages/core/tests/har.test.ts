import { describe, expect, it } from 'vitest';

import { exportToHar, importFromHar } from '../src/index.js';
import { request } from './fixtures.js';

describe('HAR export and import', () => {
  it('exports captured requests to valid HAR 1.2 log structure', () => {
    const req1 = request({ id: 'r1', timestamp: 1_700_000_000_000, durationMs: 150 });
    const req2 = request({
      id: 'r2',
      timestamp: 1_700_000_001_000,
      durationMs: 200,
      method: 'POST',
    });

    const har = exportToHar([req1, req2]);
    expect(har.log.version).toBe('1.2');
    expect(har.log.creator.name).toBe('api-qa-inspector');
    expect(har.log.entries).toHaveLength(2);
    expect(har.log.entries[0]?.request.method).toBe('GET');
    expect(har.log.entries[0]?.time).toBe(150);
    expect(har.log.entries[1]?.request.method).toBe('POST');
  });

  it('imports valid HAR log entries into raw observations', () => {
    const harSample = {
      log: {
        version: '1.2',
        entries: [
          {
            startedDateTime: '2026-10-28T02:00:00.000Z',
            time: 45,
            request: {
              method: 'GET',
              url: 'https://api.test/v1/products',
            },
            response: {
              status: 200,
            },
          },
        ],
      },
    };

    const observations = importFromHar(harSample);
    expect(observations).toHaveLength(1);
    expect(observations[0]?.url).toBe('https://api.test/v1/products');
    expect(observations[0]?.method).toBe('GET');
    expect(observations[0]?.durationMs).toBe(45);
    expect(observations[0]?.status).toBe(200);
  });

  it('handles empty or malformed HAR input gracefully', () => {
    expect(importFromHar(null)).toEqual([]);
    expect(importFromHar({})).toEqual([]);
    expect(importFromHar({ log: {} })).toEqual([]);
    expect(importFromHar({ log: { entries: [null, { request: {} }] } })).toEqual([]);
  });

  it('handles fallback timestamp and missing response/time in entries', () => {
    const harSample = {
      log: {
        version: '1.2',
        entries: [
          {
            request: { method: 'GET', url: 'https://api.test/simple' },
          },
        ],
      },
    };

    const obs = importFromHar(harSample);
    expect(obs).toHaveLength(1);
    expect(obs[0]?.durationMs).toBeNull();
    expect(obs[0]?.status).toBeNull();
  });
});
