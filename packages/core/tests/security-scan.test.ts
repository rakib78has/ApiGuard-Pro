import { describe, expect, it } from 'vitest';

import { scanSecurityIssues } from '../src/index.js';
import { request } from './fixtures.js';

describe('security & PII scanner', () => {
  it('detects unmasked SSN in URL query', () => {
    const req = request({
      url: 'https://app.test/api/verify?user_data=123-45-6789',
    });

    const findings = scanSecurityIssues([req]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.type).toBe('pii-leakage');
    expect(findings[0]?.severity).toBe('critical');
    expect(findings[0]?.title).toContain('SSN');
  });

  it('detects valid Luhn-checked credit card number in URL', () => {
    // Standard Visa test card: 4111 1111 1111 1111 (Luhn valid)
    const req = request({
      url: 'https://app.test/api/pay?card=4111-1111-1111-1111',
    });

    const findings = scanSecurityIssues([req]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.type).toBe('pii-leakage');
    expect(findings[0]?.title).toContain('Credit Card');
  });

  it('detects expired JWT token in URL', () => {
    // JWT with exp: 1500000000 (year 2017)
    // Payload: {"sub":"1234567890","name":"John Doe","exp":1500000000}
    const expiredToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiZXhwIjoxNTAwMDAwMDAwfQ.dummySignature';
    const req = request({
      url: `https://app.test/api/auth?auth_payload=${expiredToken}`,
    });

    const findings = scanSecurityIssues([req]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.type).toBe('insecure-jwt');
    expect(findings[0]?.title).toContain('Expired JWT');
  });

  it('ignores clean requests without PII or tokens', () => {
    const req = request({
      url: 'https://app.test/api/items?category=books',
    });

    expect(scanSecurityIssues([req])).toEqual([]);
  });

  it('ignores unexpired JWT or malformed JWT token in URL', () => {
    // Valid JWT with exp far in the future (year 2099)
    // Payload: {"sub":"123","exp":4102444800}
    const futureToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJleHAiOjQxMDI0NDQ4MDB9.dummy';
    const req1 = request({
      url: `https://app.test/api/auth?custom_token=${futureToken}`,
    });

    // Malformed JWT with non-JSON payload
    const malformed = 'eyJhbGciOiJIUzI1NiJ9.bm90LWpzb24.dummy';
    const req2 = request({
      url: `https://app.test/api/auth?custom_token=${malformed}`,
    });

    // JWT with non-number exp
    const noExpToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.dummy';
    const req3 = request({
      url: `https://app.test/api/auth?custom_token=${noExpToken}`,
    });

    expect(scanSecurityIssues([req1, req2, req3])).toEqual([]);
  });
});
