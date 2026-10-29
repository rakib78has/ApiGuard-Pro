import { describe, expect, it } from 'vitest';

import { calculateDataWaste, type AnalysisResult } from '../src/index.js';

describe('data waste & carbon footprint calculator', () => {
  it('calculates wasted bytes and carbon for duplicate requests', () => {
    const analysis: AnalysisResult = {
      ruleSetName: 'Default',
      analysedRequestCount: 5,
      skippedRequestCount: 0,
      endpointStats: [],
      findings: [
        {
          id: 'f1',
          type: 'duplicate-request',
          ruleId: 'duplicate-request',
          severity: 'medium',
          confidence: 'high',
          title: 'Duplicate calls',
          reasoning: 'Repeated calls',
          endpoint: 'POST https://app.test/api/items',
          evidence: {
            requestIds: ['r1', 'r2', 'r3'],
            requestCount: 3,
            firstTimestamp: 1000,
            lastTimestamp: 1500,
            measurements: {},
          },
        },
      ],
    };

    const waste = calculateDataWaste(analysis);

    expect(waste.wastedRequestsCount).toBe(2);
    expect(waste.estimatedWastedBytes).toBeGreaterThan(0);
    expect(waste.estimatedWastedKb).toBeGreaterThan(0);
    expect(waste.recommendations.length).toBeGreaterThan(0);
  });

  it('reports zero waste for clean scans', () => {
    const analysis: AnalysisResult = {
      ruleSetName: 'Default',
      analysedRequestCount: 2,
      skippedRequestCount: 0,
      endpointStats: [],
      findings: [],
    };

    const waste = calculateDataWaste(analysis);
    expect(waste.wastedRequestsCount).toBe(0);
    expect(waste.estimatedWastedBytes).toBe(0);
    expect(waste.recommendations[0]).toContain('Clean network profile');
  });

  it('handles other finding types and single-count findings', () => {
    const analysis: AnalysisResult = {
      ruleSetName: 'Default',
      analysedRequestCount: 2,
      skippedRequestCount: 0,
      endpointStats: [],
      findings: [
        {
          id: 'f1',
          type: 'excessive-polling',
          ruleId: 'excessive-polling',
          severity: 'medium',
          confidence: 'high',
          title: 'Polling',
          reasoning: 'Fast polling',
          endpoint: 'GET https://app.test/api/poll',
          evidence: {
            requestIds: ['r1'],
            requestCount: 1,
            firstTimestamp: 1000,
            lastTimestamp: 1000,
            measurements: {},
          },
        },
        {
          id: 'f2',
          type: 'retry-loop',
          ruleId: 'retry-loop',
          severity: 'high',
          confidence: 'high',
          title: 'Retry storm',
          reasoning: 'Retried 3 times',
          endpoint: 'POST https://app.test/api/retry',
          evidence: {
            requestIds: ['r2', 'r3', 'r4'],
            requestCount: 3,
            firstTimestamp: 1000,
            lastTimestamp: 2000,
            measurements: {},
          },
        },
        {
          id: 'f3',
          type: 'request-after-navigation',
          ruleId: 'request-after-navigation',
          severity: 'medium',
          confidence: 'high',
          title: 'After nav',
          reasoning: 'Sent after nav',
          endpoint: null,
          evidence: {
            requestIds: ['r5'],
            requestCount: 2,
            firstTimestamp: 1000,
            lastTimestamp: 1100,
            measurements: {},
          },
        },
        {
          id: 'f4',
          type: 'unexpected-endpoint',
          ruleId: 'unexpected-endpoint',
          severity: 'low',
          confidence: 'high',
          title: 'Other',
          reasoning: 'Other',
          endpoint: null,
          evidence: {
            requestIds: [],
            requestCount: 0,
            firstTimestamp: null,
            lastTimestamp: null,
            measurements: {},
          },
        },
      ],
    };

    const waste = calculateDataWaste(analysis);
    expect(waste.wastedRequestsCount).toBe(3);
  });
});
