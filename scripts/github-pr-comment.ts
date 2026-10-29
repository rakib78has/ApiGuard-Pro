// Generates a GitHub PR markdown comment summarizing API QA test results.
// Usage: node scripts/github-pr-comment.ts [report-json-path] [output-markdown-file]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const inputPath = process.argv[2] ?? 'reports/runner/api-qa-report.json';
const outputPath = process.argv[3];

let report: Record<string, unknown> = {};

if (existsSync(inputPath)) {
  try {
    const parsed: unknown = JSON.parse(readFileSync(inputPath, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null) {
      report = parsed as Record<string, unknown>;
    }
  } catch {
    // defaults
  }
}

const summary =
  typeof report.summary === 'object' && report.summary !== null
    ? (report.summary as Record<string, unknown>)
    : {};
const regression =
  typeof report.regression === 'object' && report.regression !== null
    ? (report.regression as Record<string, unknown>)
    : {};

const passed = regression.passed !== false;
const totalFindings = Number(summary.totalFindings ?? 0);
const severity =
  typeof summary.findingsBySeverity === 'object' && summary.findingsBySeverity !== null
    ? (summary.findingsBySeverity as Record<string, number>)
    : {};
const critical = severity.critical ?? 0;
const high = severity.high ?? 0;
const medium = severity.medium ?? 0;
const low = severity.low ?? 0;

let md = `## 🎯 API QA Inspector Report\n\n`;

if (passed && totalFindings === 0) {
  md += `✅ **All API budgets and detection checks passed!** No regressions or anomalies found.\n\n`;
} else if (!passed) {
  md += `⚠️ **API Regressions Detected!** Review the findings below before merging.\n\n`;
} else {
  md += `ℹ️ **Scan completed with findings.**\n\n`;
}

md += `### 📊 Summary\n\n`;
md += `| Total Findings | Critical | High | Medium | Low |\n`;
md += `| :---: | :---: | :---: | :---: | :---: |\n`;
md += `| **${String(totalFindings)}** | ${String(critical)} | ${String(high)} | ${String(medium)} | ${String(low)} |\n\n`;

const regressionFindings = Array.isArray(regression.findings)
  ? (regression.findings as { type?: string; endpoint?: string; title?: string }[])
  : [];

if (regressionFindings.length > 0) {
  md += `### 🚨 Regressions\n\n`;
  md += `| Type | Endpoint | Title |\n`;
  md += `| :--- | :--- | :--- |\n`;
  for (const f of regressionFindings) {
    md += `| \`${f.type ?? 'unknown'}\` | \`${f.endpoint ?? 'N/A'}\` | ${f.title ?? ''} |\n`;
  }
  md += `\n`;
}

md += `*Generated automatically by [API QA Inspector](https://github.com/rakib78has/Api-Radar)*\n`;

if (outputPath) {
  writeFileSync(outputPath, md);
  process.stdout.write(`PR comment written to ${outputPath}\n`);
} else {
  process.stdout.write(md);
}
