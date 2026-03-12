import { FormEvent, useState } from "react";

import {
  useCapabilities,
  useRebuildAll,
  useRebuildSession,
  useSystemStatus,
} from "../api/hooks";
import {
  EmptyState,
  ErrorState,
  JsonBlock,
  LoadingState,
  Panel,
  SectionTitle,
} from "../components/UiPrimitives";

export function RebuildPage() {
  const capabilities = useCapabilities();
  const systemStatus = useSystemStatus();
  const rebuildAll = useRebuildAll();
  const [sessionId, setSessionId] = useState("");
  const rebuildSession = useRebuildSession(sessionId || undefined);
  const ready = systemStatus.data?.ready ?? false;

  async function handleRebuildAll() {
    if (!ready) {
      return;
    }

    if (
      window.confirm(
        "Trigger a full Smart Memory rebuild? This will replay derived memory for the entire dataset.",
      )
    ) {
      await rebuildAll.mutateAsync();
    }
  }

  async function handleRebuildSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !sessionId.trim()) {
      return;
    }

    if (
      window.confirm(
        `Trigger a rebuild for session ${sessionId}? This will replay derived memory tied to that session.`,
      )
    ) {
      await rebuildSession.mutateAsync();
    }
  }

  return (
    <div className="page">
      <SectionTitle
        title="Rebuild & Debug"
        meta="Run safe rebuild operations, inspect before/after summaries, and verify which Smart Memory capabilities are currently available."
      />

      <div className="grid two">
        <Panel title="System Status">
          {systemStatus.isPending ? <LoadingState label="Loading system status..." rows={5} /> : null}
          {systemStatus.error ? (
            <ErrorState error={systemStatus.error} onRetry={() => systemStatus.refetch()} />
          ) : null}
          {systemStatus.data ? (
            <JsonBlock
              collapsed
              filename="system-status.json"
              title="System status"
              value={systemStatus.data}
            />
          ) : (
            <EmptyState>Waiting for system status.</EmptyState>
          )}
        </Panel>

        <Panel title="Backend Capabilities">
          {capabilities.isPending ? <LoadingState label="Loading capability probe..." rows={5} /> : null}
          {capabilities.error ? (
            <ErrorState error={capabilities.error} onRetry={() => capabilities.refetch()} />
          ) : null}
          {capabilities.data ? (
            <JsonBlock
              collapsed
              filename="capabilities.json"
              title="Capability probe"
              value={capabilities.data}
            />
          ) : (
            <EmptyState>Waiting for capability probe.</EmptyState>
          )}
        </Panel>
      </div>

      <Panel
        title="Danger Zone"
        description="Rebuild actions are intentionally isolated here because they can reshape derived memory state."
      >
        <div className="button-row">
          <button
            className="button-danger"
            disabled={!ready || rebuildAll.isPending}
            type="button"
            onClick={handleRebuildAll}
          >
            {rebuildAll.isPending ? "Rebuilding..." : "Rebuild All"}
          </button>
        </div>

        <form className="inline-form stack" style={{ marginTop: 16 }} onSubmit={handleRebuildSession}>
          <input
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value)}
            placeholder="session_task"
          />
          <button
            className="button-primary"
            disabled={!ready || rebuildSession.isPending}
            type="submit"
          >
            {rebuildSession.isPending ? "Rebuilding session..." : "Rebuild Session"}
          </button>
        </form>

        {!ready ? (
          <p className="meta" style={{ marginTop: 12 }}>
            Rebuild actions stay disabled while Smart Memory is unavailable.
          </p>
        ) : (
          <p className="meta" style={{ marginTop: 12 }}>
            Rebuild responses include before/after counters and lane deltas once the action completes.
          </p>
        )}
      </Panel>

      {rebuildAll.error ? <ErrorState error={rebuildAll.error} /> : null}
      {rebuildSession.error ? <ErrorState error={rebuildSession.error} /> : null}

      {rebuildAll.data ? (
        <Panel title="Full Rebuild Result">
          <JsonBlock filename="rebuild-all-result.json" title="Full rebuild result" value={rebuildAll.data} />
        </Panel>
      ) : null}

      {rebuildSession.data ? (
        <Panel title="Session Rebuild Result">
          <JsonBlock
            filename={`rebuild-session-${sessionId || "result"}.json`}
            title="Session rebuild result"
            value={rebuildSession.data}
          />
        </Panel>
      ) : null}
    </div>
  );
}
