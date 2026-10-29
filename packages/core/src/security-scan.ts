import type { CapturedRequest, Finding } from '@api-qa/contracts';

import { buildFinding, evidenceFrom } from './detection/findings.js';

function isLuhnValid(digits: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    const char = digits[i];
    if (char === undefined) {
      continue;
    }
    let n = parseInt(char, 10);
    if (Number.isNaN(n)) {
      return false;
    }
    if (alternate) {
      n *= 2;
      if (n > 9) {
        n -= 9;
      }
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

function base64ToUtf8(base64: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let buffer = 0;
  let bits = 0;
  let output = '';
  for (const c of base64) {
    if (c === '=') {
      break;
    }
    const val = chars.indexOf(c);
    if (val === -1) {
      continue;
    }
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  const second = parts[1];
  if (parts.length < 2 || second === undefined) {
    return null;
  }
  try {
    const base64 = second.replace(/-/g, '+').replace(/_/g, '/');
    const json = base64ToUtf8(base64);
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Scans captured requests for PII leakage (SSN, Credit Cards) and insecure JWT tokens.
 */
export function scanSecurityIssues(requests: readonly CapturedRequest[]): Finding[] {
  const findings: Finding[] = [];

  const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/;
  const ccCandidatePattern = /\b(?:\d{4}[ -]?){3}\d{4}\b/;
  const jwtPattern = /ey[A-Za-z0-9_-]+\.ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;

  for (const req of requests) {
    const inspectTarget = req.url;

    // 1. SSN Check
    if (ssnPattern.test(inspectTarget)) {
      findings.push(
        buildFinding({
          type: 'pii-leakage',
          ruleId: 'pii-scanner',
          identity: `${req.id}|ssn`,
          severity: 'critical',
          confidence: 'high',
          title: `Potential SSN (Social Security Number) leaked in URL on ${req.fingerprint.endpoint}`,
          reasoning: `Request URL matches standard SSN formatting pattern. Avoid transmitting PII in URLs.`,
          endpoint: req.fingerprint.endpoint,
          evidence: evidenceFrom([req], { type: 'SSN' }),
        }),
      );
    }

    // 2. Credit Card Check
    const ccMatch = ccCandidatePattern.exec(inspectTarget);
    const candidate = ccMatch?.[0];
    if (candidate !== undefined) {
      const stripped = candidate.replace(/[\s-]/g, '');
      if (stripped.length >= 13 && stripped.length <= 19 && isLuhnValid(stripped)) {
        findings.push(
          buildFinding({
            type: 'pii-leakage',
            ruleId: 'pii-scanner',
            identity: `${req.id}|credit-card`,
            severity: 'critical',
            confidence: 'high',
            title: `Unmasked Credit Card number detected in URL on ${req.fingerprint.endpoint}`,
            reasoning: `Request URL contains a valid Luhn-checked payment card number. Transmitting card numbers in URLs violates PCI-DSS.`,
            endpoint: req.fingerprint.endpoint,
            evidence: evidenceFrom([req], { type: 'CreditCard' }),
          }),
        );
      }
    }

    // 3. Insecure JWT Check
    const jwtMatches = inspectTarget.match(jwtPattern);
    if (jwtMatches !== null) {
      for (const token of jwtMatches) {
        const payload = parseJwtPayload(token);
        if (payload !== null) {
          const exp = typeof payload.exp === 'number' ? payload.exp : null;
          const isExpired = exp !== null && Date.now() / 1000 > exp;

          if (isExpired) {
            findings.push(
              buildFinding({
                type: 'insecure-jwt',
                ruleId: 'jwt-scanner',
                identity: `${req.id}|expired-jwt`,
                severity: 'medium',
                confidence: 'high',
                title: `Expired JWT token transmitted in URL on ${req.fingerprint.endpoint}`,
                reasoning: `JWT expiration (exp: ${String(exp)}) is in the past. Expired tokens should be refreshed before sending.`,
                endpoint: req.fingerprint.endpoint,
                evidence: evidenceFrom([req], { exp, current: Math.floor(Date.now() / 1000) }),
              }),
            );
          }
        }
      }
    }
  }

  return findings;
}
