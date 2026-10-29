import type { CapturedRequest } from '@api-qa/contracts';

/**
 * Generates Mock Service Worker (MSW) route handlers from captured requests.
 */
export function generateMswHandlers(requests: readonly CapturedRequest[]): string {
  const seen = new Set<string>();
  const lines: string[] = [
    "import { http, HttpResponse } from 'msw';",
    '',
    'export const handlers = [',
  ];

  for (const req of requests) {
    const key = `${req.method} ${req.url}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const methodLower = req.method.toLowerCase();
    const status = req.status ?? 200;

    lines.push(`  http.${methodLower}('${req.url}', () => {`);
    lines.push(`    return HttpResponse.json({ mock: true }, { status: ${String(status)} });`);
    lines.push('  }),');
  }

  lines.push('];\n');
  return lines.join('\n');
}

/**
 * Generates a standalone Node.js mock HTTP server script reproducing captured endpoints.
 */
export function generateNodeMockServer(requests: readonly CapturedRequest[], port = 3000): string {
  const routes = new Map<string, number>();

  for (const req of requests) {
    const key = `${req.method} ${req.path}`;
    if (!routes.has(key)) {
      routes.set(key, req.status ?? 200);
    }
  }

  const routesObject = JSON.stringify(Object.fromEntries(routes.entries()), null, 2);

  return `// Auto-generated Mock Server by API QA Inspector
import http from 'node:http';

const routes = ${routesObject};
const PORT = process.env.PORT || ${String(port)};

const server = http.createServer((req, res) => {
  const key = \`\${req.method} \${req.url?.split('?')[0]}\`;
  const status = routes[key] || 404;

  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ mock: true, key, status }));
});

server.listen(PORT, () => {
  console.log(\`Mock server running at http://localhost:\${PORT}\`);
});
`;
}
