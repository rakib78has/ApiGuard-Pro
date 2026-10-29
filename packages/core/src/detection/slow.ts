import type { CapturedRequest, DetectionRuleSet, Finding } from '@api-qa/contracts';

import { buildFinding, evidenceFrom, formatMs } from './findings.js';
import { groupBy } from './requests.js';

/**
 * Detects API requests whose duration exceeds the configured threshold.
 */
export function detectSlowEndpoints(
  requests: readonly CapturedRequest[],
  config: DetectionRuleSet['slow'],
): Finding[] {
  if (!config.enabled) {
    return [];
  }

  const slowRequests = requests.filter(
    (r) => r.durationMs !== null && r.durationMs > config.thresholdMs,
  );

  if (slowRequests.length === 0) {
    return [];
  }

  const byEndpoint = groupBy(slowRequests, (r) => r.fingerprint.endpoint);
  const findings: Finding[] = [];

  for (const [endpoint, endpointRequests] of byEndpoint) {
    const durations = endpointRequests
      .map((r) => r.durationMs)
      .filter((d): d is number => d !== null)
      .sort((a, b) => a - b);
    const maxDuration = durations.at(-1) ?? 0;
    const medianDuration = durations[Math.floor(durations.length / 2)] ?? 0;

    const severity = maxDuration >= config.thresholdMs * 3 ? 'high' : 'medium';
    const confidence = durations.length >= 3 ? 'high' : 'medium';

    findings.push(
      buildFinding({
        type: 'slow-endpoint',
        ruleId: 'slow-endpoint',
        identity: `${endpoint}|slow`,
        severity,
        confidence,
        title: `Slow API calls to ${endpoint}`,
        reasoning: `${String(endpointRequests.length)} call${endpointRequests.length === 1 ? '' : 's'} took up to ${formatMs(maxDuration)} (threshold: ${formatMs(config.thresholdMs)}). Median: ${formatMs(medianDuration)}.`,
        endpoint,
        evidence: evidenceFrom(endpointRequests, {
          thresholdMs: config.thresholdMs,
          maxDurationMs: maxDuration,
          medianDurationMs: medianDuration,
          count: endpointRequests.length,
        }),
      }),
    );
  }

  return findings;
}
