import { DEFAULT_RULE_SET } from '@api-qa/contracts';
import { describe, expect, it } from 'vitest';

import { analyzeRequests, detectPayloadBloom } from '../src/index.js';
import { request, ruleSet } from './fixtures.js';

const normOptions = { ...DEFAULT_RULE_SET.normalization, maxBodyLength: 1_000 };

describe('payload bloom detector', () => {
  it('does nothing when disabled', () => {
    const req = request(
      {
        body: { kind: 'text', text: 'x'.repeat(2_000), contentType: 'application/json' },
      },
      normOptions,
    );

    const findings = detectPayloadBloom([req], { enabled: false, maxSizeBytes: 1_000_000 });
    expect(findings).toEqual([]);
  });

  it('detects truncated / oversized payload when enabled', () => {
    const req = request(
      {
        body: { kind: 'text', text: 'x'.repeat(2_000), contentType: 'application/json' },
      },
      normOptions,
    );

    const findings = detectPayloadBloom([req], { enabled: true, maxSizeBytes: 1_000_000 });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.type).toBe('payload-bloom');
    expect(findings[0]?.severity).toBe('medium');
  });

  it('integrates into analyzeRequests when configured', () => {
    const rules = ruleSet({ payload: { enabled: true, maxSizeBytes: 1_000_000 } });
    const req = request(
      {
        body: { kind: 'text', text: 'x'.repeat(2_000), contentType: 'application/json' },
      },
      normOptions,
    );

    const result = analyzeRequests({ requests: [req], navigations: [] }, rules);
    const payloadFindings = result.findings.filter((f) => f.type === 'payload-bloom');
    expect(payloadFindings).toHaveLength(1);
  });
});
