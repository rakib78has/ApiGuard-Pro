import type { CapturedRequest, Finding } from '@api-qa/contracts';

import { buildFinding, evidenceFrom } from './detection/findings.js';

export function calculateQueryDepth(query: string): number {
  let maxDepth = 0;
  let currentDepth = 0;

  for (const char of query) {
    if (char === '{') {
      currentDepth++;
      if (currentDepth > maxDepth) {
        maxDepth = currentDepth;
      }
    } else if (char === '}') {
      if (currentDepth > 0) {
        currentDepth--;
      }
    }
  }

  return maxDepth;
}

/**
 * Inspects requests to GraphQL endpoints, flagging overly deep nested queries or anti-patterns.
 */
export function inspectGraphQLRequests(
  requests: readonly CapturedRequest[],
  maxAllowedDepth = 5,
): Finding[] {
  const findings: Finding[] = [];

  for (const req of requests) {
    const isGraphql = req.path.includes('/graphql') || req.url.includes('query=');
    if (!isGraphql) {
      continue;
    }

    // Check query depth from URL query parameter if present
    const match = /[?&]query=([^&#]*)/.exec(req.url);
    const queryValue = match?.[1];
    const queryParam =
      queryValue !== undefined ? decodeURIComponent(queryValue.replace(/\+/g, ' ')) : null;

    if (queryParam !== null) {
      const depth = calculateQueryDepth(queryParam);
      if (depth > maxAllowedDepth) {
        findings.push(
          buildFinding({
            type: 'graphql-deep-query',
            ruleId: 'graphql-inspector',
            identity: `${req.id}|depth-${String(depth)}`,
            severity: 'medium',
            confidence: 'high',
            title: `Excessive GraphQL Query Depth (${String(depth)} levels) on ${req.fingerprint.endpoint}`,
            reasoning: `GraphQL query nested depth is ${String(depth)} (maximum recommended: ${String(maxAllowedDepth)}). Deep nesting causes heavy database JOIN overhead.`,
            endpoint: req.fingerprint.endpoint,
            evidence: evidenceFrom([req], {
              depth,
              maxAllowedDepth,
            }),
          }),
        );
      }
    }
  }

  return findings;
}
