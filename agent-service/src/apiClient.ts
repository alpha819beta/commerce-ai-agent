import { config } from './config';

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: ApiErrorPayload;
}

/**
 * Thrown whenever the Backend API returns `success: false`, or the request
 * fails before a response is even parsed (network error, bad JSON, etc).
 * `code`/`message` mirror the Backend API's own error envelope (see
 * src/utils/errors.ts in the root project) so tool code can react to specific
 * error codes like ORDER_NOT_FOUND without string-matching messages.
 */
export class ApiClientError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function request<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  const url = `${config.apiBaseUrl}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiClientError(
      'NETWORK_ERROR',
      `Could not reach the Backend API at ${url}: ${(err as Error).message}`,
      0
    );
  }

  let envelope: ApiEnvelope<T>;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch (err) {
    throw new ApiClientError(
      'INVALID_RESPONSE',
      `Backend API returned a non-JSON response (status ${response.status})`,
      response.status
    );
  }

  if (!envelope.success || envelope.data === undefined) {
    const error = envelope.error;
    throw new ApiClientError(
      error?.code || 'UNKNOWN_ERROR',
      error?.message || `Backend API request failed with status ${response.status}`,
      response.status,
      error?.details
    );
  }

  return envelope.data;
}

export const apiClient = {
  get: <T>(path: string): Promise<T> => request<T>('GET', path),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown): Promise<T> => request<T>('PUT', path, body),
};
