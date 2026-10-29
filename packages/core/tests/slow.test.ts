import { describe, expect, it } from 'vitest';

import { analyzeRequests, detectSlowEndpoints } from '../src/index.js';
import { request, ruleSet } from './fixtures.js';

describe('slow endpoint detector', () => {
  it('does nothing when disabled', () => {
    const req = request({ durationMs: 5000 });
    const findings = detectSlowEndpoints([req], { enabled: false, thresholdMs: 2000 });
    expect(findings).toEqual([]);
  });

  it('reports slow endpoint when duration exceeds threshold', () => {
    const req1 = request({ id: 'r1', durationMs: 3000, timestamp: 1000 });
    const req2 = request({ id: 'r2', durationMs: 3500, timestamp: 2000 });
    const findings = detectSlowEndpoints([req1, req2], { enabled: true, thresholdMs: 2000 });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.type).toBe('slow-endpoint');
    expect(findings[0]?.severity).toBe('medium');
    expect(findings[0]?.evidence.requestCount).toBe(2);
    expect(findings[0]?.evidence.measurements.maxDurationMs).toBe(3500);
  });

  it('assigns high severity when duration is 3x threshold', () => {
    const req = request({ durationMs: 7000 });
    const findings = detectSlowEndpoints([req], { enabled: true, thresholdMs: 2000 });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('high');
  });

  it('integrates cleanly into analyzeRequests when enabled in rules', () => {
    const rules = ruleSet({ slow: { enabled: true, thresholdMs: 1500 } });
    const req = request({ durationMs: 2500 });
    const result = analyzeRequests({ requests: [req], navigations: [] }, rules);

    const slowFindings = result.findings.filter((f) => f.type === 'slow-endpoint');
    expect(slowFindings).toHaveLength(1);
  });
});
