import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { ApiError } from "../api/client";
import { safeJson } from "../utils/format";

export function Panel(props: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      {props.title ? <h3>{props.title}</h3> : null}
      {props.description ? <p className="meta">{props.description}</p> : null}
      {props.children}
    </section>
  );
}

export function EmptyState(props: { children: ReactNode }) {
  return <div className="empty">{props.children}</div>;
}

export function CopyButton(props: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(props.value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      className={props.className ?? "button-secondary button-small"}
      onClick={handleCopy}
      type="button"
    >
      {copied ? "Copied" : props.label ?? "Copy"}
    </button>
  );
}

export function JsonBlock(props: {
  value: unknown;
  title?: string;
  filename?: string;
  collapsed?: boolean;
}) {
  const text = useMemo(() => safeJson(props.value), [props.value]);
  const [expanded, setExpanded] = useState(!props.collapsed);

  function handleDownload() {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = props.filename ?? "payload.json";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  }

  return (
    <div className="json-shell">
      <div className="json-toolbar">
        <div className="meta">{props.title ?? "JSON payload"}</div>
        <div className="button-row">
          <button
            className="button-secondary button-small"
            onClick={() => setExpanded((current) => !current)}
            type="button"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
          <CopyButton label="Copy JSON" value={text} />
          <button className="button-secondary button-small" onClick={handleDownload} type="button">
            Download
          </button>
        </div>
      </div>
      {expanded ? (
        <pre className="code-block">{text}</pre>
      ) : (
        <div className="json-preview">{text.slice(0, 240)}{text.length > 240 ? "..." : ""}</div>
      )}
    </div>
  );
}

export function LoadingState(props?: { label?: string; rows?: number }) {
  const rows = props?.rows ?? 4;
  return (
    <div className="empty skeleton-panel" aria-live="polite">
      <div className="meta">{props?.label ?? "Loading data..."}</div>
      <div className="skeleton-stack" aria-hidden="true">
        {Array.from({ length: rows }).map((_, index) => (
          <span
            key={index}
            className="skeleton-line"
            style={{
              width: `${92 - index * 9}%`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function describeError(error?: unknown, message?: string) {
  if (error instanceof ApiError) {
    if (error.kind === "timeout") {
      return {
        title: "Request timed out",
        detail: "The orchestrator did not answer before the timeout window closed.",
        tone: "warn",
        raw: error.raw,
        meta: error.url,
      };
    }

    if (error.kind === "network") {
      return {
        title: "Network error",
        detail: "The browser could not reach the orchestrator. Check the active host and port.",
        tone: "danger",
        raw: error.raw,
        meta: error.url,
      };
    }

    if (error.kind === "server") {
      return {
        title: error.status && error.status >= 500 ? "Server error" : "Request failed",
        detail: error.message,
        tone: error.status && error.status >= 500 ? "danger" : "warn",
        raw: error.raw,
        meta: error.status ? `HTTP ${error.status} · ${error.url}` : error.url,
      };
    }
  }

  if (message) {
    return {
      title: "Request failed",
      detail: message,
      tone: "danger",
      raw: error instanceof Error ? error.stack : undefined,
      meta: undefined,
    };
  }

  if (error instanceof Error) {
    return {
      title: "Unexpected error",
      detail: error.message,
      tone: "danger",
      raw: error.stack,
      meta: undefined,
    };
  }

  return {
    title: "Unexpected error",
    detail: "An unknown error occurred.",
    tone: "danger",
    raw: error === undefined ? undefined : String(error),
    meta: undefined,
  };
}

export function ErrorState(props: {
  error?: unknown;
  message?: string;
  onRetry?: () => void;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const { title, detail, tone, raw, meta } = describeError(props.error, props.message);

  return (
    <div className={`empty error-card ${tone}`} role="alert">
      <strong>{title}</strong>
      <div>{detail}</div>
      {meta ? <div className="meta">{meta}</div> : null}
      <div className="button-row" style={{ marginTop: 12 }}>
        {props.onRetry ? (
          <button className="button-secondary button-small" onClick={props.onRetry} type="button">
            Retry
          </button>
        ) : null}
        {raw ? (
          <button
            className="button-secondary button-small"
            onClick={() => setShowRaw((current) => !current)}
            type="button"
          >
            {showRaw ? "Hide raw error" : "Show raw error"}
          </button>
        ) : null}
      </div>
      {showRaw && raw ? <pre className="code-block" style={{ marginTop: 12 }}>{raw}</pre> : null}
    </div>
  );
}

export function SectionTitle(props: { title: string; meta?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h2>{props.title}</h2>
        {props.meta ? <p>{props.meta}</p> : null}
      </div>
      {props.actions ? <div className="page-header-actions">{props.actions}</div> : null}
    </div>
  );
}
