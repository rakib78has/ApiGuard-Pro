import type { CapturedRequest, DetectionRuleSet, Finding } from '@api-qa/contracts';

import { buildFinding, evidenceFrom, formatMs } from './findings.js';
import { contextKey, groupBy } from './requests.js';

function createWaterfallFinding(
  chain: readonly CapturedRequest[],
  config: DetectionRuleSet['waterfall'],
): Finding {
  const first = chain[0];
  const last = chain.at(-1);
  if (first === undefined || last === undefined) {
    throw new Error('Waterfall chain must not be empty');
  }
  const origin = first.origin;
  const totalDuration = last.timestamp + (last.durationMs ?? 0) - first.timestamp;

  return buildFinding({
    type: 'waterfall-requests',
    ruleId: 'waterfall-requests',
    identity: `${first.id}|${String(chain.length)}|waterfall`,
    severity: 'medium',
    confidence: 'high',
    title: `Waterfall API chain (${String(chain.length)} sequential calls) on ${origin}`,
    reasoning: `${String(chain.length)} API calls ran back-to-back sequentially over ${formatMs(totalDuration)}. Consider batching or fetching in parallel.`,
    endpoint: `${origin}/*`,
    evidence: evidenceFrom(chain, {
      chainLength: chain.length,
      totalDurationMs: totalDuration,
      gapToleranceMs: config.gapToleranceMs,
    }),
  });
}

/**
 * Detects cascading / waterfall chains where requests execute one after another
 * on the same origin/page instead of being dispatched in parallel.
 */
export function detectWaterfallRequests(
  requests: readonly CapturedRequest[],
  config: DetectionRuleSet['waterfall'],
): Finding[] {
  if (!config.enabled) {
    return [];
  }

  const validRequests = requests.filter((r) => r.durationMs !== null && r.durationMs > 0);

  const byPage = groupBy(validRequests, (r) => `${contextKey(r)}|${r.origin}`);
  const findings: Finding[] = [];

  for (const [, pageRequests] of byPage) {
    const sorted = [...pageRequests].sort((a, b) => a.timestamp - b.timestamp);

    let currentChain: CapturedRequest[] = [];

    for (const req of sorted) {
      if (currentChain.length === 0) {
        currentChain.push(req);
        continue;
      }

      const prev = currentChain.at(-1);
      if (prev === undefined) {
        currentChain.push(req);
        continue;
      }
      const prevEnd = prev.timestamp + (prev.durationMs ?? 0);
      const gap = req.timestamp - prevEnd;

      if (gap >= 0 && gap <= config.gapToleranceMs) {
        currentChain.push(req);
      } else {
        if (currentChain.length >= config.minChainLength) {
          findings.push(createWaterfallFinding(currentChain, config));
        }
        currentChain = [req];
      }
    }

    if (currentChain.length >= config.minChainLength) {
      findings.push(createWaterfallFinding(currentChain, config));
    }
  }

  return findings;
}
