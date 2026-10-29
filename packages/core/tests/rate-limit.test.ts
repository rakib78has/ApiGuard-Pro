import type { CapturedRequest } from '@api-qa/contracts';
import { describe, expect, it } from 'vitest';

import { detectRateLimits, inspectRateLimitHeaders } from '../src/detection/rate-limit.js';

function makeRequest(
  id: string,
  url: string,
  timestamp: number,
  status: number | null = 200,
): CapturedRequest {
  return {
    id,
    timestamp,
    source: 'extension-devtools',
    method: 'GET',
    origin: 'https://api.example.com',
    path: '/users',
    url,
    resourceType: 'api',
    status,
    error: null,
    durationMs: 50,
    initiator: null,
    context: { tabId: 1, frameId: 0, documentId: null },
    fingerprint: {
      endpoint: 'GET api.example.com/users',
      requestKey: '0123456789abcdef',
      bodyHash: null,
      bodyStatus: 'absent',
    },
  };
}

describe('detectRateLimits', () => {
  it('returns empty when disabled', () => {
    const req = makeRequest('r1', 'https://api.example.com/users', 1000, 429);
    const findings = detectRateLimits([req], {
      enabled: false,
      maxRequestsPerWindow: 10,
      windowMs: 60_000,
    });
    expect(findings).toEqual([]);
  });

  it('returns empty when requests array is empty', () => {
    const findings = detectRateLimits([], {
      enabled: true,
      maxRequestsPerWindow: 10,
      windowMs: 60_000,
    });
    expect(findings).toEqual([]);
  });

  it('detects HTTP 429 status and reports high severity finding', () => {
    const r1 = makeRequest('r1', 'https://api.example.com/users', 1000, 200);
    const r2 = makeRequest('r2', 'https://api.example.com/users', 1500, 429);
    const findings = detectRateLimits([r1, r2], {
      enabled: true,
      maxRequestsPerWindow: 60,
      windowMs: 60_000,
    });

    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding).toBeDefined();
    if (!finding) {
      throw new Error('Expected finding');
    }
    expect(finding.type).toBe('rate-limit-warning');
    expect(finding.ruleId).toBe('rate-limit-status-429');
    expect(finding.severity).toBe('high');
    expect(finding.title).toContain('429');
    expect(finding.evidence.requestCount).toBe(1);
    expect(finding.evidence.measurements.status).toBe(429);
  });

  it('detects burst calls exceeding threshold within sliding window', () => {
    // 5 requests within 1000ms, threshold is 3
    const requests = [
      makeRequest('r1', 'https://api.example.com/users', 100),
      makeRequest('r2', 'https://api.example.com/users', 200),
      makeRequest('r3', 'https://api.example.com/users', 400),
      makeRequest('r4', 'https://api.example.com/users', 600),
      makeRequest('r5', 'https://api.example.com/users', 800),
    ];

    const findings = detectRateLimits(requests, {
      enabled: true,
      maxRequestsPerWindow: 3,
      windowMs: 1000,
    });

    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding).toBeDefined();
    if (!finding) {
      throw new Error('Expected finding');
    }
    expect(finding.type).toBe('rate-limit-warning');
    expect(finding.ruleId).toBe('rate-limit-burst');
    expect(finding.severity).toBe('medium');
    expect(finding.title).toContain('High request burst');
    expect(finding.evidence.measurements.maxBurstCount).toBe(5);
  });

  it('does not report burst when requests stay below threshold', () => {
    const requests = [
      makeRequest('r1', 'https://api.example.com/users', 100),
      makeRequest('r2', 'https://api.example.com/users', 200),
      makeRequest('r3', 'https://api.example.com/users', 300),
    ];

    const findings = detectRateLimits(requests, {
      enabled: true,
      maxRequestsPerWindow: 10,
      windowMs: 1000,
    });

    expect(findings).toEqual([]);
  });

  it('handles sliding window moving across spaced requests correctly', () => {
    // 4 requests spread out over 4 seconds, window is 1 second, threshold is 2
    const requests = [
      makeRequest('r1', 'https://api.example.com/users', 1000),
      makeRequest('r2', 'https://api.example.com/users', 2500),
      makeRequest('r3', 'https://api.example.com/users', 4000),
      makeRequest('r4', 'https://api.example.com/users', 5500),
    ];

    const findings = detectRateLimits(requests, {
      enabled: true,
      maxRequestsPerWindow: 2,
      windowMs: 1000,
    });

    expect(findings).toEqual([]);
  });
});

describe('inspectRateLimitHeaders', () => {
  it('parses standard ratelimit headers', () => {
    const result = inspectRateLimitHeaders({
      'RateLimit-Remaining': '50',
      'RateLimit-Limit': '100',
      'RateLimit-Reset': '30',
    });

    expect(result.hasRateLimitHeaders).toBe(true);
    expect(result.remaining).toBe(50);
    expect(result.limit).toBe(100);
    expect(result.resetSeconds).toBe(30);
    expect(result.isExhausted).toBe(false);
  });

  it('detects quota exhaustion when remaining is 0', () => {
    const result = inspectRateLimitHeaders({
      'x-ratelimit-remaining': '0',
      'x-ratelimit-limit': '60',
      'retry-after': '120',
    });

    expect(result.hasRateLimitHeaders).toBe(true);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(60);
    expect(result.resetSeconds).toBe(120);
    expect(result.isExhausted).toBe(true);
  });

  it('handles absent or non-numeric headers safely', () => {
    const emptyResult = inspectRateLimitHeaders({});
    expect(emptyResult.hasRateLimitHeaders).toBe(false);
    expect(emptyResult.remaining).toBeNull();
    expect(emptyResult.limit).toBeNull();
    expect(emptyResult.resetSeconds).toBeNull();
    expect(emptyResult.isExhausted).toBe(false);

    const invalidResult = inspectRateLimitHeaders({
      'RateLimit-Remaining': 'invalid',
      'RateLimit-Limit': undefined,
    });
    expect(invalidResult.hasRateLimitHeaders).toBe(false);
    expect(invalidResult.remaining).toBeNull();
  });
});
