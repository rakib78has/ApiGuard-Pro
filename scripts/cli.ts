// Standalone terminal runner for API QA Inspector.
// Usage: node scripts/cli.ts <path-to-har-or-json> [options]
// Options:
//   --rules <path>      Custom detection rule set JSON file
//   --html <path>       Generate standalone HTML report
//   --json              Output raw analysis JSON
//   --strict            Exit with code 1 on ANY finding (default: only high/critical)
//   --help, -h          Show help message
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import process from 'node:process';

import {
  DEFAULT_RULE_SET,
  detectionRuleSetSchema,
  type CapturedRequest,
  type DetectionRuleSet,
  type NavigationEvent,
  type RawNavigationObservation,
  type RawRequestObservation,
} from '@api-qa/contracts';
import {
  analyzeRequests,
  calculateDataWaste,
  diagnoseFinding,
  importFromHar,
  normalizeNavigation,
  normalizeRequest,
} from '@api-qa/core';
import { buildReport, reportToHtml } from '@api-qa/reporting';

function printHelp(): void {
  process.stdout.write(`
ApiGuard Pro — CLI Runner
Enforce API contracts, budgets, and security standards.
Usage: node scripts/cli.ts <file> [options]

Arguments:
  <file>              Path to a .har file or .json capture session file.

Options:
  --rules <path>      Path to custom DetectionRuleSet JSON file.
  --html <path>       Save rich HTML report to the specified file.
  --json              Output analysis results in JSON format.
  --strict            Fail (exit code 1) on any finding, including low/medium.
  --help, -h          Display this help message.

Examples:
  node scripts/cli.ts traffic.har
  node scripts/cli.ts session.json --html report.html
  node scripts/cli.ts traffic.har --strict --json
`);
}

function parseCliArgs(args: readonly string[]) {
  let filePath: string | null = null;
  let rulesPath: string | null = null;
  let htmlPath: string | null = null;
  let json = false;
  let strict = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    } else if (arg === '--rules' && i + 1 < args.length) {
      rulesPath = args[i + 1] ?? null;
      i += 1;
    } else if (arg === '--html' && i + 1 < args.length) {
      htmlPath = args[i + 1] ?? null;
      i += 1;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--strict') {
      strict = true;
    } else if (!arg.startsWith('-') && filePath === null) {
      filePath = arg;
    }
  }

  return { filePath, rulesPath, htmlPath, json, strict };
}

function loadTraffic(
  filePath: string,
  ruleSet: DetectionRuleSet,
): { requests: CapturedRequest[]; navigations: NavigationEvent[] } {
  const resolved = resolve(process.cwd(), filePath);
  if (!existsSync(resolved)) {
    process.stderr.write(`Error: file not found "${resolved}"\n`);
    process.exit(1);
  }

  const content = readFileSync(resolved, 'utf8');

  if (filePath.endsWith('.har') || (content.includes('"log"') && content.includes('"entries"'))) {
    try {
      const rawList = importFromHar(content);
      const requests = rawList.flatMap((raw) => {
        const norm = normalizeRequest(raw, ruleSet.normalization);
        return norm.ok ? [norm.request] : [];
      });
      return { requests, navigations: [] };
    } catch (err) {
      process.stderr.write(`Failed to parse HAR file: ${String(err)}\n`);
      process.exit(1);
    }
  }

  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed === 'object' && parsed !== null) {
      if ('requests' in parsed && Array.isArray(parsed.requests)) {
        const rawRequests = parsed.requests as (CapturedRequest | RawRequestObservation)[];
        const rawNavigations = (
          'navigations' in parsed && Array.isArray(parsed.navigations) ? parsed.navigations : []
        ) as (NavigationEvent | RawNavigationObservation)[];

        const requests = rawRequests.flatMap((item) => {
          if ('fingerprint' in item) {
            return [item];
          }
          const norm = normalizeRequest(item, ruleSet.normalization);
          return norm.ok ? [norm.request] : [];
        });

        const navigations = rawNavigations.flatMap((item) => {
          const norm = normalizeNavigation(item, ruleSet.normalization);
          return norm.ok ? [norm.navigation] : [];
        });

        return { requests, navigations };
      }
      if (Array.isArray(parsed)) {
        const items = parsed as (CapturedRequest | RawRequestObservation)[];
        const requests = items.flatMap((item) => {
          if ('fingerprint' in item) {
            return [item];
          }
          const norm = normalizeRequest(item, ruleSet.normalization);
          return norm.ok ? [norm.request] : [];
        });
        return { requests, navigations: [] };
      }
    }
  } catch (err) {
    process.stderr.write(`Failed to parse JSON file: ${String(err)}\n`);
    process.exit(1);
  }

  process.stderr.write(
    `Error: Unrecognized format in "${filePath}". Expected HAR, Session JSON, or Observations JSON.\n`,
  );
  process.exit(1);
}

function loadRuleSet(rulesPath: string | null): DetectionRuleSet {
  if (rulesPath === null) {
    return DEFAULT_RULE_SET;
  }
  const resolved = resolve(process.cwd(), rulesPath);
  if (!existsSync(resolved)) {
    process.stderr.write(`Warning: rules file not found "${resolved}". Using default rules.\n`);
    return DEFAULT_RULE_SET;
  }
  try {
    const raw: unknown = JSON.parse(readFileSync(resolved, 'utf8'));
    return detectionRuleSetSchema.parse(raw);
  } catch (err) {
    process.stderr.write(
      `Failed to parse rules file "${rulesPath}": ${String(err)}. Using default rules.\n`,
    );
    return DEFAULT_RULE_SET;
  }
}

function main(): void {
  const { filePath, rulesPath, htmlPath, json, strict } = parseCliArgs(process.argv.slice(2));

  if (filePath === null) {
    printHelp();
    process.exit(1);
  }

  const ruleSet = loadRuleSet(rulesPath);
  const { requests, navigations } = loadTraffic(filePath, ruleSet);

  const analysis = analyzeRequests({ requests, navigations }, ruleSet);
  const waste = calculateDataWaste(analysis);

  if (htmlPath !== null) {
    const diagnostics: Record<string, { rootCause: string; fix: string; snippet?: string }> = {};
    for (const finding of analysis.findings) {
      const advice = diagnoseFinding(finding);
      diagnostics[finding.id] = {
        rootCause: advice.probableRootCause,
        fix: advice.suggestedFixTitle,
        snippet: advice.codeSnippet,
      };
    }

    const reportResult = buildReport({
      session: {
        schemaVersion: 1,
        id: 'cli-session',
        name: basename(filePath),
        source: 'extension-devtools',
        startedAt: requests[0]?.timestamp ?? Date.now(),
        endedAt: requests.at(-1)?.timestamp ?? Date.now(),
        requests,
        navigations: [],
        droppedRequestCount: 0,
        triage: {},
      },
      analysis,
      generatedAt: Date.now(),
      toolVersion: '0.1.2',
    });

    if (reportResult.ok) {
      const html = reportToHtml(reportResult.value, {
        diagnostics,
        carbonSummary: {
          totalBytes: waste.estimatedWastedBytes,
          carbonGrams: waste.estimatedCarbonGramsCO2,
        },
      });
      writeFileSync(resolve(process.cwd(), htmlPath), html, 'utf8');
      if (!json) {
        process.stdout.write(`\n📄 HTML report written to: ${htmlPath}\n`);
      }
    } else {
      process.stderr.write(`Failed to build report: ${reportResult.issues.join('; ')}\n`);
    }
  }

  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          file: filePath,
          ruleSet: ruleSet.name,
          analyzedRequests: analysis.analysedRequestCount,
          findings: analysis.findings,
          endpointStats: analysis.endpointStats,
          waste,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stdout.write('\n' + '='.repeat(60) + '\n');
    process.stdout.write(`  ApiGuard Pro CLI — Analysis Summary\n`);
    process.stdout.write('='.repeat(60) + '\n');
    process.stdout.write(`Target File:      ${filePath}\n`);
    process.stdout.write(`Rule Set:         ${ruleSet.name}\n`);
    process.stdout.write(`Analyzed Calls:   ${String(analysis.analysedRequestCount)}\n`);
    process.stdout.write(`Endpoints:        ${String(analysis.endpointStats.length)}\n`);
    process.stdout.write(`Total Findings:   ${String(analysis.findings.length)}\n`);

    const sevCounts: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    for (const f of analysis.findings) {
      sevCounts[f.severity] = (sevCounts[f.severity] ?? 0) + 1;
    }

    process.stdout.write(
      `Severity Breakdown: [CRITICAL: ${String(sevCounts.critical)}] [HIGH: ${String(sevCounts.high)}] [MEDIUM: ${String(sevCounts.medium)}] [LOW: ${String(sevCounts.low)}]\n`,
    );
    process.stdout.write(
      `Eco / Carbon:     🌱 ${String(waste.estimatedWastedKb)} KB wasted (~${String(waste.estimatedCarbonGramsCO2)} gCO2e)\n`,
    );
    process.stdout.write('-'.repeat(60) + '\n');

    if (analysis.findings.length === 0) {
      process.stdout.write('✅ Clean! No API defects or anomalies detected.\n\n');
    } else {
      process.stdout.write('Detected Issues:\n');
      for (const [idx, f] of analysis.findings.entries()) {
        process.stdout.write(
          `  ${String(idx + 1)}. [${f.severity.toUpperCase()}] ${f.title}\n` +
            `     Type:     ${f.type}\n` +
            `     Endpoint: ${f.endpoint ?? 'n/a'}\n` +
            `     Details:  ${f.reasoning}\n`,
        );
        const advice = diagnoseFinding(f);
        process.stdout.write(`     💡 AI Advice: ${advice.suggestedFixTitle}\n`);
      }
      process.stdout.write('\n');
    }
  }

  const hasHighOrCritical = analysis.findings.some(
    (f) => f.severity === 'critical' || f.severity === 'high',
  );
  if (strict && analysis.findings.length > 0) {
    process.exit(1);
  } else if (hasHighOrCritical) {
    process.exit(1);
  }

  process.exit(0);
}

main();
