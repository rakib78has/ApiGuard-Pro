import type { Finding } from '@api-qa/contracts';
import { describe, expect, it } from 'vitest';

import { diagnoseFinding } from '../src/index.js';

describe('AI diagnostics & root-cause advisor', () => {
  it('provides debounce/React guidance for duplicate requests', () => {
    const finding: Finding = {
      id: 'f1',
      type: 'duplicate-request',
      ruleId: 'duplicate-request',
      severity: 'high',
      confidence: 'high',
      title: 'Duplicate POST to /api/checkout',
      reasoning: '2 equivalent calls in 200ms',
      endpoint: 'POST https://app.test/api/checkout',
      evidence: {
        requestIds: ['r1', 'r2'],
        requestCount: 2,
        firstTimestamp: 1000,
        lastTimestamp: 1200,
        measurements: {},
      },
    };

    const advice = diagnoseFinding(finding);
    expect(advice.probableRootCause).toContain('button clicks');
    expect(advice.suggestedFixTitle).toContain('Disable trigger button');
    expect(advice.codeSnippet).toContain('disabled');
    expect(advice.bestPractices.length).toBeGreaterThan(0);
  });

  it('provides AbortController snippet for request-after-navigation', () => {
    const finding: Finding = {
      id: 'f2',
      type: 'request-after-navigation',
      ruleId: 'request-after-navigation',
      severity: 'medium',
      confidence: 'high',
      title: 'Request after navigation',
      reasoning: 'Request sent after page left',
      endpoint: 'GET https://app.test/api/news',
      evidence: {
        requestIds: ['r1'],
        requestCount: 1,
        firstTimestamp: 1000,
        lastTimestamp: 1000,
        measurements: {},
      },
    };

    const advice = diagnoseFinding(finding);
    expect(advice.suggestedFixTitle).toContain('AbortController');
    expect(advice.codeSnippet).toContain('controller.abort()');
  });

  it('provides Promise.all guidance for waterfall requests', () => {
    const finding: Finding = {
      id: 'f3',
      type: 'waterfall-requests',
      ruleId: 'waterfall-requests',
      severity: 'medium',
      confidence: 'high',
      title: 'Waterfall requests',
      reasoning: '3 sequential calls',
      endpoint: 'https://app.test/*',
      evidence: {
        requestIds: ['r1', 'r2', 'r3'],
        requestCount: 3,
        firstTimestamp: 1000,
        lastTimestamp: 1300,
        measurements: {},
      },
    };

    const advice = diagnoseFinding(finding);
    expect(advice.suggestedFixTitle).toContain('Promise.all');
    expect(advice.codeSnippet).toContain('Promise.all');
  });

  it('provides default advice for unmapped finding types', () => {
    const finding: Finding = {
      id: 'f4',
      type: 'unexpected-call-count',
      ruleId: 'unexpected-call-count',
      severity: 'medium',
      confidence: 'high',
      title: 'Unexpected call count',
      reasoning: 'Call count exceeded',
      endpoint: 'GET https://app.test/api/count',
      evidence: {
        requestIds: ['r1'],
        requestCount: 1,
        firstTimestamp: 1000,
        lastTimestamp: 1000,
        measurements: {},
      },
    };

    const advice = diagnoseFinding(finding);
    expect(advice.suggestedFixTitle).toContain('Review API contracts');
  });
});
