import apiClient from './apiClient';

export interface LogEntry {
  id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
  meta?: Record<string, unknown> | null;
}

export interface GetLogsOptions {
  cursor?: string | number | null;
  limit?: number;
}

export interface GetLogsResponse {
  success: boolean;
  logs: LogEntry[];
  hasMore: boolean;
  nextCursor: string | null;
  message?: string;
}

export interface ClearLogsResponse {
  success: boolean;
  message?: string;
}

const DEFAULT_LOG_LIMIT = 50;
const MAX_LOG_LIMIT = 200;

const normalizeGetLogsOptions = (options?: GetLogsOptions): { cursor?: string; limit: number } => {
  const cursor =
    typeof options?.cursor === 'string' && options.cursor.trim().length > 0
      ? options.cursor.trim()
      : typeof options?.cursor === 'number' && Number.isFinite(options.cursor)
        ? String(options.cursor)
        : undefined;

  const requestedLimit =
    typeof options?.limit === 'number' && Number.isFinite(options.limit)
      ? Math.floor(options.limit)
      : DEFAULT_LOG_LIMIT;
  const limit = Math.min(MAX_LOG_LIMIT, Math.max(1, requestedLimit));

  return { cursor, limit };
};

type RawGetLogsResponse = Partial<GetLogsResponse> & {
  logs?: unknown;
  hasMore?: unknown;
  nextCursor?: unknown;
};

const normalizeLogsResponse = (payload: RawGetLogsResponse): GetLogsResponse => {
  const logs = Array.isArray(payload.logs) ? (payload.logs as LogEntry[]) : [];
  const nextCursor =
    typeof payload.nextCursor === 'string'
      ? payload.nextCursor
      : payload.nextCursor === null
        ? null
        : null;

  return {
    success: Boolean(payload.success),
    logs,
    hasMore: payload.hasMore === true,
    nextCursor,
    message: typeof payload.message === 'string' ? payload.message : undefined,
  };
};

export const systemApi = {
  getLogs: async (options?: GetLogsOptions): Promise<GetLogsResponse> => {
    const params = normalizeGetLogsOptions(options);
    const { data } = await apiClient.get<RawGetLogsResponse>('/system/logs', {
      params,
    });
    return normalizeLogsResponse(data);
  },
  clearLogs: async (): Promise<ClearLogsResponse> => {
    const { data } = await apiClient.post<ClearLogsResponse>('/system/logs/clear');
    return data;
  },
};
