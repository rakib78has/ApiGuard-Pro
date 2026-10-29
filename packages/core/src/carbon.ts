import type { AnalysisResult } from './analysis/analyze.js';

export interface WasteReport {
  readonly wastedRequestsCount: number;
  readonly estimatedWastedBytes: number;
  readonly estimatedWastedKb: number;
  readonly estimatedWastedMb: number;
  readonly estimatedCarbonGramsCO2: number;
  readonly recommendations: readonly string[];
}

/** Standard estimate: ~0.2g CO2e per 1 MB transferred over broadband/mobile */
const CO2_GRAMS_PER_MB = 0.2;
const AVERAGE_REQUEST_SIZE_BYTES = 2048; // 2 KB estimated average API overhead

/**
 * Calculates wasted network data and environmental carbon footprint (gCO2e)
 * caused by duplicate requests, retry storms, and excessive polling.
 */
export function calculateDataWaste(analysis: AnalysisResult): WasteReport {
  let wastedRequestsCount = 0;
  const wastedRequestIds = new Set<string>();

  for (const finding of analysis.findings) {
    if (
      finding.type === 'duplicate-request' ||
      finding.type === 'excessive-polling' ||
      finding.type === 'retry-loop' ||
      finding.type === 'request-after-navigation'
    ) {
      // Exclude the first request (which is legitimate), count duplicates
      const count = finding.evidence.requestCount;
      if (count > 1) {
        wastedRequestsCount += count - 1;
      }
      for (const id of finding.evidence.requestIds.slice(1)) {
        wastedRequestIds.add(id);
      }
    }
  }

  const estimatedWastedBytes = wastedRequestsCount * AVERAGE_REQUEST_SIZE_BYTES;
  const estimatedWastedKb = Math.round((estimatedWastedBytes / 1024) * 100) / 100;
  const estimatedWastedMb = Math.round((estimatedWastedBytes / (1024 * 1024)) * 1000) / 1000;
  const estimatedCarbonGramsCO2 =
    Math.round(estimatedWastedMb * CO2_GRAMS_PER_MB * 10_000) / 10_000;

  const recommendations: string[] = [];
  if (wastedRequestsCount > 0) {
    recommendations.push(
      `Eliminating ${String(wastedRequestsCount)} redundant API calls will save ~${String(estimatedWastedKb)} KB of mobile data for your users.`,
    );
    recommendations.push(
      `Estimated carbon footprint reduction: ${String(estimatedCarbonGramsCO2)} g CO2e per session.`,
    );
  } else {
    recommendations.push('Clean network profile! Zero redundant data transmission detected.');
  }

  return {
    wastedRequestsCount,
    estimatedWastedBytes,
    estimatedWastedKb,
    estimatedWastedMb,
    estimatedCarbonGramsCO2,
    recommendations,
  };
}
