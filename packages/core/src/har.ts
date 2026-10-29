import type { CapturedRequest, RawRequestObservation } from '@api-qa/contracts';

export interface HarHeader {
  readonly name: string;
  readonly value: string;
}

export interface HarQuery {
  readonly name: string;
  readonly value: string;
}

export interface HarEntry {
  readonly startedDateTime: string;
  readonly time: number;
  readonly request: {
    readonly method: string;
    readonly url: string;
    readonly httpVersion: string;
    readonly headers: readonly HarHeader[];
    readonly queryString: readonly HarQuery[];
    readonly bodySize: number;
  };
  readonly response: {
    readonly status: number;
    readonly statusText: string;
    readonly httpVersion: string;
    readonly headers: readonly HarHeader[];
    readonly bodySize: number;
  };
}

export interface HarLog {
  readonly log: {
    readonly version: '1.2';
    readonly creator: {
      readonly name: string;
      readonly version: string;
    };
    readonly entries: readonly HarEntry[];
  };
}

/**
 * Exports captured requests into standard HTTP Archive (HAR 1.2) structure.
 */
export function exportToHar(requests: readonly CapturedRequest[]): HarLog {
  const entries: HarEntry[] = requests.map((request) => {
    const startedDateTime = new Date(request.timestamp).toISOString();
    return {
      startedDateTime,
      time: request.durationMs ?? 0,
      request: {
        method: request.method,
        url: request.url,
        httpVersion: 'HTTP/1.1',
        headers: [],
        queryString: [],
        bodySize: -1,
      },
      response: {
        status: request.status ?? 0,
        statusText: request.status === 200 ? 'OK' : '',
        httpVersion: 'HTTP/1.1',
        headers: [],
        bodySize: -1,
      },
    };
  });

  return {
    log: {
      version: '1.2',
      creator: {
        name: 'api-qa-inspector',
        version: '0.1.2',
      },
      entries,
    },
  };
}

/**
 * Imports a HAR log and converts its entries into RawRequestObservation records.
 */
export function importFromHar(harData: unknown): RawRequestObservation[] {
  if (typeof harData !== 'object' || harData === null || !('log' in harData)) {
    return [];
  }

  const log = (harData as Record<string, unknown>).log;
  if (typeof log !== 'object' || log === null || !('entries' in log)) {
    return [];
  }

  const entries = (log as Record<string, unknown>).entries;
  if (!Array.isArray(entries)) {
    return [];
  }

  const observations: RawRequestObservation[] = [];

  entries.forEach((entry: unknown, index: number) => {
    if (typeof entry !== 'object' || entry === null) {
      return;
    }
    const e = entry as Record<string, unknown>;
    const req = e.request as Record<string, unknown> | undefined;
    const res = e.response as Record<string, unknown> | undefined;

    if (!req || typeof req.url !== 'string' || typeof req.method !== 'string') {
      return;
    }

    const timestamp =
      typeof e.startedDateTime === 'string' ? Date.parse(e.startedDateTime) : Date.now();

    const durationMs = typeof e.time === 'number' && Number.isFinite(e.time) ? e.time : null;
    const status = typeof res?.status === 'number' ? res.status : null;

    observations.push({
      id: `har-${String(index + 1).padStart(4, '0')}`,
      timestamp: Number.isNaN(timestamp) ? Date.now() : timestamp,
      source: 'playwright',
      method: req.method,
      url: req.url,
      resourceType: 'fetch',
      status,
      error: null,
      durationMs,
      initiator: null,
      context: {
        tabId: 1,
        frameId: 0,
        documentId: 'har-import',
      },
      body: { kind: 'absent' },
    });
  });

  return observations;
}
