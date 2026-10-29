import type { Finding } from '@api-qa/contracts';

export interface DiagnosticAdvice {
  readonly probableRootCause: string;
  readonly suggestedFixTitle: string;
  readonly codeSnippet: string;
  readonly bestPractices: readonly string[];
}

const KNOWN_ADVICE: Readonly<Record<string, DiagnosticAdvice>> = {
  'duplicate-request': {
    probableRootCause:
      'Rapid button clicks without disabling the UI, or a React useEffect hook firing multiple times without proper dependency tracking.',
    suggestedFixTitle: 'Disable trigger button or apply debounce',
    codeSnippet: `// 1. Disable submit button while pending:\nconst [isSubmitting, setIsSubmitting] = useState(false);\n<button disabled={isSubmitting} onClick={async () => {\n  setIsSubmitting(true);\n  try { await api.submit(); } finally { setIsSubmitting(false); }\n}}>Submit</button>`,
    bestPractices: [
      'Disable form buttons immediately on submit.',
      'Use React Query, SWR, or RTK Query for automatic request deduplication.',
      'Add a debounce or throttle to search inputs.',
    ],
  },
  'retry-loop': {
    probableRootCause:
      'An error handler or HTTP interceptor is repeatedly retrying failed calls without an attempt limit or backoff delay.',
    suggestedFixTitle: 'Implement Exponential Backoff',
    codeSnippet: `async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<Response> {\n  for (let i = 0; i < retries; i++) {\n    try {\n      const res = await fetch(url);\n      if (res.ok) return res;\n    } catch (err) {}\n    await new Promise(r => setTimeout(r, delay * Math.pow(2, i)));\n  }\n  throw new Error("Max retries exceeded");\n}`,
    bestPractices: [
      'Never retry on 4xx client errors (400, 401, 403, 404).',
      'Always use exponential backoff with random jitter to avoid thundering herd.',
      'Cap maximum retry attempts (e.g., 3 attempts).',
    ],
  },
  'request-after-navigation': {
    probableRootCause:
      'A background timer (setInterval) or in-flight fetch outlived the unmounted page, causing memory leaks.',
    suggestedFixTitle: 'Cancel in-flight request with AbortController',
    codeSnippet: `useEffect(() => {\n  const controller = new AbortController();\n  fetch(endpoint, { signal: controller.signal })\n    .then(res => res.json())\n    .then(data => setData(data))\n    .catch(err => {\n      if (err.name !== 'AbortError') console.error(err);\n    });\n  return () => controller.abort(); // Clean up on unmount\n}, []);`,
    bestPractices: [
      'Always abort fetch requests inside component cleanup functions.',
      'Clear all setTimeout and setInterval callbacks on unmount.',
    ],
  },
  'slow-endpoint': {
    probableRootCause:
      'Database query bottleneck, missing DB indexes, uncompressed large responses, or blocking synchronous server operations.',
    suggestedFixTitle: 'Optimize query & add cache headers',
    codeSnippet: `// Enable gzip/brotli compression and add HTTP cache headers:\nres.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');`,
    bestPractices: [
      'Add pagination to endpoints returning unbounded lists.',
      'Check database query execution plans for sequential scans.',
      'Enable gzip/brotli compression on the web server.',
    ],
  },
  'waterfall-requests': {
    probableRootCause:
      'Sequential "await" statements executing independent API calls one after another instead of concurrently.',
    suggestedFixTitle: 'Execute parallel requests with Promise.all',
    codeSnippet: `// Instead of sequential calls:\n// const user = await fetchUser();\n// const config = await fetchConfig();\n\n// Run concurrently:\nconst [user, config] = await Promise.all([\n  fetchUser(),\n  fetchConfig()\n]);`,
    bestPractices: [
      'Dispatch all independent data dependencies simultaneously.',
      'Consider server-side orchestration (BFF - Backend For Frontend) or GraphQL.',
    ],
  },
  'payload-bloom': {
    probableRootCause:
      'Large unpaginated data sets, embedded base64 assets, or redundant debug fields transmitted in JSON bodies.',
    suggestedFixTitle: 'Paginate results and trim payload',
    codeSnippet: `// Use cursor or limit-offset pagination:\nconst response = await fetch('/api/items?limit=20&cursor=' + nextCursor);`,
    bestPractices: [
      'Upload files directly to object storage via presigned S3 URLs instead of JSON base64.',
      'Enable server-side pagination with standard limit parameters.',
    ],
  },
  'rate-limit-warning': {
    probableRootCause:
      'High client request velocity or lack of client-side throttling causing upstream 429 Too Many Requests responses or quota depletion.',
    suggestedFixTitle: 'Implement Client Rate Limiter & Honor Retry-After',
    codeSnippet: `// Respect Retry-After header on 429 responses:\nif (response.status === 429) {\n  const retryAfterSec = Number(response.headers.get('Retry-After')) || 5;\n  await new Promise(r => setTimeout(r, retryAfterSec * 1000));\n  return retry();\n}`,
    bestPractices: [
      'Read and respect "Retry-After" and "RateLimit-Reset" response headers.',
      'Queue and throttle bulk requests with a token bucket or p-queue.',
      'Cache read-heavy API responses client-side.',
    ],
  },
};

/**
 * Analyzes an API QA finding and provides AI-powered root cause analysis
 * and actionable frontend/backend code fix recommendations.
 */
export function diagnoseFinding(finding: Finding): DiagnosticAdvice {
  const match = KNOWN_ADVICE[finding.type];
  if (match !== undefined) {
    return match;
  }

  return {
    probableRootCause: `Policy or specification violation detected for ${finding.endpoint ?? finding.ruleId}.`,
    suggestedFixTitle: 'Review API contracts & rules',
    codeSnippet: '// Verify API endpoint expectations against contracts',
    bestPractices: ['Review OpenAPI specification', 'Verify backend endpoint availability'],
  };
}
