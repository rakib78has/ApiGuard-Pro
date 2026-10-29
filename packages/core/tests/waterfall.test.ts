import { describe, expect, it } from 'vitest';

import { analyzeRequests, detectWaterfallRequests } from '../src/index.js';
import { request, ruleSet } from './fixtures.js';

describe('waterfall requests detector', () => {
  it('does nothing when disabled', () => {
    const r1 = request({ id: 'r1', timestamp: 1000, durationMs: 100 });
    const r2 = request({ id: 'r2', timestamp: 1100, durationMs: 100 });
    const r3 = request({ id: 'r3', timestamp: 1200, durationMs: 100 });

    const findings = detectWaterfallRequests([r1, r2, r3], {
      enabled: false,
      minChainLength: 3,
      gapToleranceMs: 50,
    });
    expect(findings).toEqual([]);
  });

  it('detects a chain of 3 consecutive sequential calls', () => {
    // r1: 1000 to 1100
    // r2: 1110 to 1210 (gap: 10ms <= 50ms)
    // r3: 1220 to 1320 (gap: 10ms <= 50ms)
    const r1 = request({ id: 'r1', timestamp: 1000, durationMs: 100 });
    const r2 = request({
      id: 'r2',
      timestamp: 1110,
      durationMs: 100,
      url: 'https://app.test/api/step2',
    });
    const r3 = request({
      id: 'r3',
      timestamp: 1220,
      durationMs: 100,
      url: 'https://app.test/api/step3',
    });

    const findings = detectWaterfallRequests([r1, r2, r3], {
      enabled: true,
      minChainLength: 3,
      gapToleranceMs: 50,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.type).toBe('waterfall-requests');
    expect(findings[0]?.evidence.requestCount).toBe(3);
    expect(findings[0]?.evidence.measurements.chainLength).toBe(3);
  });

  it('ignores calls with large gaps between them', () => {
    const r1 = request({ id: 'r1', timestamp: 1000, durationMs: 100 });
    const r2 = request({ id: 'r2', timestamp: 1500, durationMs: 100 }); // gap 400ms > 50ms
    const r3 = request({ id: 'r3', timestamp: 2000, durationMs: 100 });

    const findings = detectWaterfallRequests([r1, r2, r3], {
      enabled: true,
      minChainLength: 3,
      gapToleranceMs: 50,
    });

    expect(findings).toEqual([]);
  });

  it('integrates into analyzeRequests when configured', () => {
    const rules = ruleSet({ waterfall: { enabled: true, minChainLength: 3, gapToleranceMs: 50 } });
    const r1 = request({ id: 'r1', timestamp: 1000, durationMs: 100 });
    const r2 = request({
      id: 'r2',
      timestamp: 1100,
      durationMs: 100,
      url: 'https://app.test/api/2',
    });
    const r3 = request({
      id: 'r3',
      timestamp: 1200,
      durationMs: 100,
      url: 'https://app.test/api/3',
    });

    const result = analyzeRequests({ requests: [r1, r2, r3], navigations: [] }, rules);
    const waterfallFindings = result.findings.filter((f) => f.type === 'waterfall-requests');
    expect(waterfallFindings).toHaveLength(1);
  });
});
