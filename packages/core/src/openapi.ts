import type { CapturedRequest, Finding } from '@api-qa/contracts';

import { buildFinding, evidenceFrom } from './detection/findings.js';

export interface OpenApiMethodSpec {
  readonly summary?: string;
  readonly description?: string;
}

export type OpenApiPathItem = Record<string, unknown>;

export interface OpenApiSpec {
  readonly openapi?: string;
  readonly swagger?: string;
  readonly paths: Record<string, OpenApiPathItem>;
}

function openApiPathToPattern(path: string): RegExp {
  // Convert {param} into [^/]+ and quote regex characters
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regexStr = '^' + escaped.replace(/\\\{[^/]+\\\}/g, '[^/]+') + '$';
  return new RegExp(regexStr);
}

/**
 * Validates captured requests against an OpenAPI 3.x / Swagger 2.0 specification,
 * flagging undocumented endpoints or unsupported methods.
 */
export function validateOpenApi(
  requests: readonly CapturedRequest[],
  spec: OpenApiSpec,
): Finding[] {
  const paths = spec.paths as unknown;
  if (typeof paths !== 'object' || paths === null) {
    return [];
  }

  const pathPatterns: {
    readonly rawPath: string;
    readonly regex: RegExp;
    readonly methods: Set<string>;
  }[] = [];

  for (const [rawPath, pathItem] of Object.entries(spec.paths)) {
    const methods = new Set<string>();
    for (const key of Object.keys(pathItem)) {
      const upper = key.toUpperCase();
      if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(upper)) {
        methods.add(upper);
      }
    }

    pathPatterns.push({
      rawPath,
      regex: openApiPathToPattern(rawPath),
      methods,
    });
  }

  const findings: Finding[] = [];
  const reportedEndpoints = new Set<string>();

  for (const request of requests) {
    if (reportedEndpoints.has(request.fingerprint.endpoint)) {
      continue;
    }

    // Match request path
    const matched = pathPatterns.find((p) => p.regex.test(request.path));

    if (!matched) {
      reportedEndpoints.add(request.fingerprint.endpoint);
      findings.push(
        buildFinding({
          type: 'undocumented-endpoint',
          ruleId: 'openapi-spec',
          identity: `${request.fingerprint.endpoint}|undocumented`,
          severity: 'low',
          confidence: 'high',
          title: `Undocumented endpoint ${request.fingerprint.endpoint}`,
          reasoning: `Request to ${request.path} does not match any path defined in the OpenAPI specification.`,
          endpoint: request.fingerprint.endpoint,
          evidence: evidenceFrom([request], {
            path: request.path,
            method: request.method,
          }),
        }),
      );
    } else if (!matched.methods.has(request.method)) {
      reportedEndpoints.add(request.fingerprint.endpoint);
      findings.push(
        buildFinding({
          type: 'undocumented-endpoint',
          ruleId: 'openapi-spec',
          identity: `${request.fingerprint.endpoint}|method-not-allowed`,
          severity: 'medium',
          confidence: 'high',
          title: `Unsupported method ${request.method} for ${matched.rawPath}`,
          reasoning: `Endpoint ${matched.rawPath} is documented in OpenAPI, but does not allow ${request.method}.`,
          endpoint: request.fingerprint.endpoint,
          evidence: evidenceFrom([request], {
            path: request.path,
            method: request.method,
            allowedMethods: Array.from(matched.methods).join(', '),
          }),
        }),
      );
    }
  }

  return findings;
}
