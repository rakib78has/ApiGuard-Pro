import type { CapturedRequest, DetectionRuleSet, Finding } from '@api-qa/contracts';

import { buildFinding, evidenceFrom } from './findings.js';
import { groupBy } from './requests.js';

export interface RateLimitHeaderAnalysis {
  readonly hasRateLimitHeaders: boolean;
  readonly remaining: number | null;
  readonly limit: number | null;
  readonly resetSeconds: number | null;
  readonly isExhausted: boolean;
}

/**
 * Parses common rate limiting headers (IETF RFC draft, GitHub, Cloudflare, Twitter/X).
 */
export function inspectRateLimitHeaders(
  headers: Readonly<Record<string, string | number | undefined>>,
): RateLimitHeaderAnalysis {
  const normalized: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers)) {
    if (val !== undefined) {
      normalized[key.toLowerCase()] = String(val);
    }
  }

  const remainingRaw =
    normalized['ratelimit-remaining'] ??
    normalized['x-ratelimit-remaining'] ??
    normalized['x-rate-limit-remaining'];
  const limitRaw =
    normalized['ratelimit-limit'] ??
    normalized['x-ratelimit-limit'] ??
    normalized['x-rate-limit-limit'];
  const resetRaw =
    normalized['ratelimit-reset'] ??
    normalized['x-ratelimit-reset'] ??
    normalized['x-rate-limit-reset'] ??
    normalized['retry-after'];

  const remaining = remainingRaw !== undefined ? Number.parseInt(remainingRaw, 10) : null;
  const limit = limitRaw !== undefined ? Number.parseInt(limitRaw, 10) : null;
  const resetSeconds = resetRaw !== undefined ? Number.parseInt(resetRaw, 10) : null;

  const validRemaining = remaining !== null && !Number.isNaN(remaining) ? remaining : null;
  const validLimit = limit !== null && !Number.isNaN(limit) ? limit : null;
  const validReset = resetSeconds !== null && !Number.isNaN(resetSeconds) ? resetSeconds : null;

  const hasRateLimitHeaders = validRemaining !== null || validLimit !== null || validReset !== null;
  const isExhausted = validRemaining !== null && validRemaining <= 0;

  return {
    hasRateLimitHeaders,
    remaining: validRemaining,
    limit: validLimit,
    resetSeconds: validReset,
    isExhausted,
  };
}

/**
 * Detects rate limit issues: HTTP 429 responses and excessive burst requests exceeding quota.
 */
export function detectRateLimits(
  requests: readonly CapturedRequest[],
  config: DetectionRuleSet['rateLimit'],
): Finding[] {
  if (!config.enabled || requests.length === 0) {
    return [];
  }

  const findings: Finding[] = [];
  const byEndpoint = groupBy(requests, (r) => r.fingerprint.endpoint);

  for (const [endpoint, endpointRequests] of byEndpoint) {
    // 1. Detect 429 Too Many Requests
    const throttled = endpointRequests.filter((r) => r.status === 429);
    if (throttled.length > 0) {
      findings.push(
        buildFinding({
          type: 'rate-limit-warning',
          ruleId: 'rate-limit-status-429',
          identity: `${endpoint}|429`,
          severity: 'high',
          confidence: 'high',
          title: `Rate limit 429 exceeded on ${endpoint}`,
          reasoning: `${String(throttled.length)} request(s) received HTTP 429 (Too Many Requests). Client calls were rejected by server rate limiter.`,
          endpoint,
          evidence: evidenceFrom(throttled, {
            status: 429,
            throttledCount: throttled.length,
            totalCalls: endpointRequests.length,
          }),
        }),
      );
      // Skip burst warning if already hard throttled
      continue;
    }

    // 2. Sliding window burst detection
    if (endpointRequests.length > config.maxRequestsPerWindow) {
      const sorted = [...endpointRequests].sort((a, b) => a.timestamp - b.timestamp);
      let maxBurst = 0;
      let burstStart = 0;
      let burstEnd = 0;

      let left = 0;
      for (let right = 0; right < sorted.length; right += 1) {
        const rightReq = sorted[right];
        if (rightReq === undefined) {
          continue;
        }
        while (left < right) {
          const leftReq = sorted[left];
          if (leftReq !== undefined && rightReq.timestamp - leftReq.timestamp > config.windowMs) {
            left += 1;
          } else {
            break;
          }
        }
        const currentCount = right - left + 1;
        if (currentCount > maxBurst) {
          maxBurst = currentCount;
          const leftReq = sorted[left];
          if (leftReq !== undefined) {
            burstStart = leftReq.timestamp;
            burstEnd = rightReq.timestamp;
          }
        }
      }

      if (maxBurst > config.maxRequestsPerWindow) {
        const burstRequests = sorted.filter(
          (r) => r.timestamp >= burstStart && r.timestamp <= burstEnd,
        );
        findings.push(
          buildFinding({
            type: 'rate-limit-warning',
            ruleId: 'rate-limit-burst',
            identity: `${endpoint}|burst`,
            severity: 'medium',
            confidence: 'high',
            title: `High request burst on ${endpoint}`,
            reasoning: `${String(maxBurst)} requests fired within ${String(config.windowMs)} ms (threshold: ${String(config.maxRequestsPerWindow)}). May trigger upstream quota limits.`,
            endpoint,
            evidence: evidenceFrom(burstRequests, {
              maxBurstCount: maxBurst,
              windowMs: config.windowMs,
              threshold: config.maxRequestsPerWindow,
            }),
          }),
        );
      }
    }
  }

  return findings;
}
