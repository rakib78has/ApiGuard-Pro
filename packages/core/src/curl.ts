import type { CapturedRequest } from '@api-qa/contracts';

/**
 * Generates a reproducible curl command from a CapturedRequest.
 */
export function toCurl(request: CapturedRequest): string {
  const parts: string[] = ['curl'];

  if (request.method !== 'GET') {
    parts.push(`-X ${request.method}`);
  }

  parts.push(`"${request.url.replace(/"/g, '\\"')}"`);

  if (request.fingerprint.bodyStatus === 'captured') {
    parts.push(`--data "[BODY_REDACTED]"`);
  }

  return parts.join(' ');
}

/**
 * Generates a JavaScript fetch() code snippet from a CapturedRequest.
 */
export function toFetch(request: CapturedRequest): string {
  const options: Record<string, string> = {};
  if (request.method !== 'GET') {
    options.method = request.method;
  }

  const optionsStr =
    Object.keys(options).length > 0 ? `, {\n  method: ${JSON.stringify(options.method)}\n}` : '';

  return `await fetch(${JSON.stringify(request.url)}${optionsStr});`;
}
