import type { CapturedRequest, DetectionRuleSet, Finding } from '@api-qa/contracts';

import { buildFinding, evidenceFrom } from './findings.js';
import { groupBy } from './requests.js';

/**
 * Detects oversized request payloads that exceed payload thresholds or were truncated.
 */
export function detectPayloadBloom(
  requests: readonly CapturedRequest[],
  config: DetectionRuleSet['payload'],
): Finding[] {
  if (!config.enabled) {
    return [];
  }

  const bloatedRequests = requests.filter((r) => r.fingerprint.bodyStatus === 'truncated');

  if (bloatedRequests.length === 0) {
    return [];
  }

  const byEndpoint = groupBy(bloatedRequests, (r) => r.fingerprint.endpoint);
  const findings: Finding[] = [];

  for (const [endpoint, endpointRequests] of byEndpoint) {
    findings.push(
      buildFinding({
        type: 'payload-bloom',
        ruleId: 'payload-bloom',
        identity: `${endpoint}|payload-bloom`,
        severity: 'medium',
        confidence: 'high',
        title: `Oversized / bloated payload on ${endpoint}`,
        reasoning: `${String(endpointRequests.length)} request(s) had oversized payloads exceeding size thresholds.`,
        endpoint,
        evidence: evidenceFrom(endpointRequests, {
          maxSizeBytes: config.maxSizeBytes,
          count: endpointRequests.length,
        }),
      }),
    );
  }

  return findings;
}
