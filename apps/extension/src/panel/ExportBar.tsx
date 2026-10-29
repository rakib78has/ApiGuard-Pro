import type { CaptureSession } from '@api-qa/contracts';
import {
  calculateDataWaste,
  diagnoseFinding,
  exportToHar,
  generateMswHandlers,
  type AnalysisResult,
} from '@api-qa/core';
import {
  buildReport,
  endpointsToCsv,
  findingsToCsv,
  reportFileName,
  reportToHtml,
  reportToJson,
} from '@api-qa/reporting';
import { useState } from 'react';

function download(fileName: string, type: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}

/** Exports the sanitised report, HAR, or MSW mock handlers. */
export function ExportBar({
  session,
  analysis,
}: {
  readonly session: CaptureSession;
  readonly analysis: AnalysisResult;
}) {
  const [error, setError] = useState<string | null>(null);

  const exportAs = (format: 'json' | 'csv' | 'endpoints-csv' | 'html' | 'har' | 'msw') => {
    const safeBaseName = session.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');

    if (format === 'har') {
      const har = exportToHar(session.requests);
      download(`${safeBaseName}.har`, 'application/json', JSON.stringify(har, null, 2));
      return;
    }

    if (format === 'msw') {
      const msw = generateMswHandlers(session.requests);
      download(`${safeBaseName}.msw.ts`, 'text/plain', msw);
      return;
    }

    const result = buildReport({
      session,
      analysis,
      generatedAt: Date.now(),
      toolVersion: chrome.runtime.getManifest().version,
    });
    if (!result.ok) {
      setError(`Could not build the report: ${result.issues.join(' ')}`);
      return;
    }
    setError(null);
    const report = result.value;
    switch (format) {
      case 'json':
        download(reportFileName(report, 'json'), 'application/json', reportToJson(report));
        break;
      case 'csv':
        download(reportFileName(report, 'csv'), 'text/csv', findingsToCsv(report));
        break;
      case 'endpoints-csv':
        download(
          reportFileName(report, 'csv').replace('.csv', '-endpoints.csv'),
          'text/csv',
          endpointsToCsv(report),
        );
        break;
      case 'html': {
        const diagnostics: Record<string, { rootCause: string; fix: string; snippet?: string }> =
          {};
        for (const finding of analysis.findings) {
          const advice = diagnoseFinding(finding);
          diagnostics[finding.id] = {
            rootCause: advice.probableRootCause,
            fix: advice.suggestedFixTitle,
            snippet: advice.codeSnippet,
          };
        }
        const waste = calculateDataWaste(analysis);
        download(
          reportFileName(report, 'html'),
          'text/html',
          reportToHtml(report, {
            diagnostics,
            carbonSummary: {
              totalBytes: waste.estimatedWastedBytes,
              carbonGrams: waste.estimatedCarbonGramsCO2,
            },
          }),
        );
        break;
      }
    }
  };

  return (
    <div className="row" role="group" aria-label="Export report">
      <span className="muted">Export</span>
      <button
        type="button"
        onClick={() => {
          exportAs('html');
        }}
      >
        HTML
      </button>
      <button
        type="button"
        onClick={() => {
          exportAs('json');
        }}
      >
        JSON
      </button>
      <button
        type="button"
        onClick={() => {
          exportAs('csv');
        }}
      >
        Findings CSV
      </button>
      <button
        type="button"
        onClick={() => {
          exportAs('endpoints-csv');
        }}
      >
        Endpoints CSV
      </button>
      <button
        type="button"
        onClick={() => {
          exportAs('har');
        }}
      >
        HAR
      </button>
      <button
        type="button"
        onClick={() => {
          exportAs('msw');
        }}
      >
        MSW Mocks
      </button>
      {error !== null && <span className="error-text">{error}</span>}
    </div>
  );
}
