const baseUrl =
  import.meta.env.VITE_ORCHESTRATOR_BASE_URL?.trim() ||
  (typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:4100");

const requestTimeoutMs = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 15000);

type RequestParams = {
  path?: Record<string, string | number>;
  query?: Record<string, unknown>;
};

export type ApiErrorKind = "timeout" | "network" | "server" | "unknown";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly url: string;
  readonly raw?: string;
  readonly details?: unknown;

  constructor(input: {
    kind: ApiErrorKind;
    message: string;
    url: string;
    status?: number;
    raw?: string;
    details?: unknown;
  }) {
    super(input.message);
    this.name = "ApiError";
    this.kind = input.kind;
    this.status = input.status;
    this.url = input.url;
    this.raw = input.raw;
    this.details = input.details;
  }
}

function buildUrl(pathname: string, params?: RequestParams): string {
  let resolved = pathname;

  for (const [key, value] of Object.entries(params?.path ?? {})) {
    resolved = resolved.replace(`{${key}}`, encodeURIComponent(String(value)));
  }

  const url = new URL(resolved, `${baseUrl}/`);
  for (const [key, value] of Object.entries(params?.query ?? {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

function parseMaybeJson(text: string): unknown {
  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function extractServerMessage(status: number, raw: string, details: unknown): string {
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const record = details as Record<string, unknown>;
    const messageCandidates = [
      record.message,
      record.error,
      record.detail,
      record.title,
    ];

    for (const candidate of messageCandidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }
    }
  }

  if (raw.trim()) {
    return raw.trim();
  }

  if (status >= 500) {
    return `Server error (${status})`;
  }

  return `Request failed (${status})`;
}

async function request<T>(
  method: "GET" | "POST" | "DELETE",
  pathname: string,
  init?: { params?: RequestParams; body?: unknown },
): Promise<T> {
  const url = buildUrl(pathname, init?.params);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });

    const raw = await response.text();
    const details = parseMaybeJson(raw);

    if (!response.ok) {
      throw new ApiError({
        kind: "server",
        message: extractServerMessage(response.status, raw, details),
        status: response.status,
        url,
        raw,
        details,
      });
    }

    if (!raw.trim()) {
      return undefined as T;
    }

    return (details ?? JSON.parse(raw)) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError({
        kind: "timeout",
        message: `Request timed out after ${requestTimeoutMs} ms`,
        url,
      });
    }

    if (error instanceof Error) {
      const networkLike =
        error.name === "TypeError" || /network|fetch|failed to fetch/i.test(error.message);
      throw new ApiError({
        kind: networkLike ? "network" : "unknown",
        message: networkLike ? "Network error while contacting the orchestrator" : error.message,
        url,
        raw: error.stack,
      });
    }

    throw new ApiError({
      kind: "unknown",
      message: "Unknown API error",
      url,
      raw: String(error),
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function apiGet<T>(path: string, init?: { params?: RequestParams }) {
  return request<T>("GET", path, init);
}

export function apiPost<T>(
  path: string,
  init?: { params?: RequestParams; body?: unknown },
) {
  return request<T>("POST", path, init);
}

export function apiDelete<T>(path: string, init?: { params?: RequestParams }) {
  return request<T>("DELETE", path, init);
}
