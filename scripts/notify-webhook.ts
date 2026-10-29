// Sends API QA run summary alerts to Slack or Discord webhooks.
// Usage: node scripts/notify-webhook.ts [webhook-url] [report-json-path]
import { existsSync, readFileSync } from 'node:fs';

const webhookUrl =
  process.argv[2] ??
  process.env.API_QA_WEBHOOK_URL ??
  process.env.SLACK_WEBHOOK_URL ??
  process.env.DISCORD_WEBHOOK_URL;
const inputPath = process.argv[3] ?? 'reports/runner/api-qa-report.json';

if (!webhookUrl) {
  process.stdout.write('No webhook URL provided. Set API_QA_WEBHOOK_URL or pass as argument.\n');
  process.exit(0);
}
const targetUrl = webhookUrl;

let report: Record<string, unknown> = {};
if (existsSync(inputPath)) {
  try {
    const parsed: unknown = JSON.parse(readFileSync(inputPath, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null) {
      report = parsed as Record<string, unknown>;
    }
  } catch {
    // default
  }
}

const summary =
  typeof report.summary === 'object' && report.summary !== null
    ? (report.summary as Record<string, unknown>)
    : {};
const totalFindings = Number(summary.totalFindings ?? 0);
const regression =
  typeof report.regression === 'object' && report.regression !== null
    ? (report.regression as Record<string, unknown>)
    : {};
const passed = regression.passed !== false;

const isSlack = webhookUrl.includes('slack.com');
const isDiscord = webhookUrl.includes('discord.com');

const messageText =
  passed && totalFindings === 0
    ? `✅ [API QA Inspector] All checks passed! No regressions or anomalies.`
    : `⚠️ [API QA Inspector] Issues detected: ${String(totalFindings)} finding(s). Passed: ${String(passed)}`;

const payload = isSlack
  ? {
      text: messageText,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'API QA Inspector Report' },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Status:* ${passed ? '✅ Passed' : '🚨 Failed'}\n*Total Findings:* ${String(totalFindings)}`,
          },
        },
      ],
    }
  : isDiscord
    ? {
        content: messageText,
        embeds: [
          {
            title: 'API QA Inspector Report',
            color: passed ? 0x00ff00 : 0xff0000,
            fields: [
              { name: 'Status', value: passed ? 'Passed' : 'Failed', inline: true },
              { name: 'Findings', value: String(totalFindings), inline: true },
            ],
          },
        ],
      }
    : {
        text: messageText,
      };

async function send() {
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    process.stdout.write(`Webhook notification sent: HTTP ${String(res.status)}\n`);
  } catch (err) {
    process.stderr.write(`Failed to send webhook notification: ${String(err)}\n`);
  }
}

void send();
