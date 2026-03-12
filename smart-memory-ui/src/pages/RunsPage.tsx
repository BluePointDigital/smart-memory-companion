import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAssembleWorkspace, useRuns, useSystemStatus } from "../api/hooks";
import {
  CopyButton,
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  SectionTitle,
} from "../components/UiPrimitives";
import { formatTimestampWithRelative } from "../utils/format";

const STORAGE_KEY = "smart-memory-ui/run-form";

type RunFormState = {
  sessionId: string;
  runtime: string;
  userMessage: string;
  conversationHistory: string;
  subjectHints: string;
  taskHints: string;
  transcriptWindow: string;
  metadata: string;
};

const defaultFormState: RunFormState = {
  sessionId: "",
  runtime: "openclaw",
  userMessage: "What is blocking the database migration?",
  conversationHistory: "",
  subjectHints: "database migration,schema review",
  taskHints: "debug,execution",
  transcriptWindow: "24",
  metadata: "{\n  \"operator\": \"local-ui\",\n  \"priority\": \"normal\"\n}",
};

const presets: Array<{ label: string; state: RunFormState }> = [
  {
    label: "Investigation",
    state: defaultFormState,
  },
  {
    label: "Recall",
    state: {
      sessionId: "session_memory_review",
      runtime: "generic",
      userMessage: "What did we decide earlier about the release sequencing?",
      conversationHistory: "Need the decision and any active constraints.",
      subjectHints: "release sequencing,decision history",
      taskHints: "history,recall",
      transcriptWindow: "32",
      metadata: "{\n  \"profile\": \"high-recall\",\n  \"requested_by\": \"operator\"\n}",
    },
  },
  {
    label: "Planning",
    state: {
      sessionId: "session_planning",
      runtime: "openclaw",
      userMessage: "Assemble the current plan, blockers, and constraints for the next implementation step.",
      conversationHistory: "",
      subjectHints: "implementation plan,blockers,constraints",
      taskHints: "plan,execution",
      transcriptWindow: "18",
      metadata: "{\n  \"profile\": \"operator-planning\"\n}",
    },
  },
];

function readStoredForm(): RunFormState {
  if (typeof window === "undefined") {
    return defaultFormState;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultFormState;
    }
    return {
      ...defaultFormState,
      ...(JSON.parse(raw) as Partial<RunFormState>),
    };
  } catch {
    return defaultFormState;
  }
}

function splitHints(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseMetadata(value: string): { parsed: Record<string, unknown> | null; error: string | null } {
  if (!value.trim()) {
    return {
      parsed: {},
      error: null,
    };
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        parsed: null,
        error: "Metadata must be a JSON object.",
      };
    }

    return {
      parsed: parsed as Record<string, unknown>,
      error: null,
    };
  } catch (error) {
    return {
      parsed: null,
      error: error instanceof Error ? error.message : "Invalid JSON.",
    };
  }
}

export function RunsPage() {
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement | null>(null);
  const runs = useRuns();
  const systemStatus = useSystemStatus();
  const assembleWorkspace = useAssembleWorkspace();
  const [formState, setFormState] = useState<RunFormState>(() => readStoredForm());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(formState));
    } catch {
      // Ignore storage failures and keep the in-memory form state.
    }
  }, [formState]);

  const latestRunId = useMemo(() => runs.data?.items[0]?.run_id, [runs.data?.items]);
  const parsedMetadata = useMemo(() => parseMetadata(formState.metadata), [formState.metadata]);
  const transcriptWindow = Number(formState.transcriptWindow);
  const transcriptWindowError =
    Number.isNaN(transcriptWindow) || transcriptWindow < 1 || transcriptWindow > 200
      ? "Transcript window must be between 1 and 200 messages."
      : null;
  const messageError = formState.userMessage.trim() ? null : "User message is required.";
  const canSubmit =
    Boolean(systemStatus.data?.ready) &&
    !assembleWorkspace.isPending &&
    !messageError &&
    !transcriptWindowError &&
    !parsedMetadata.error;

  function updateField<K extends keyof RunFormState>(key: K, value: RunFormState[K]) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function loadPreset(label: string) {
    const preset = presets.find((item) => item.label === label);
    if (!preset) {
      return;
    }
    setFormState(preset.state);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !parsedMetadata.parsed) {
      return;
    }

    const bundle = await assembleWorkspace.mutateAsync({
      session_id: formState.sessionId.trim() || undefined,
      runtime: formState.runtime,
      user_message: formState.userMessage.trim(),
      conversation_history: formState.conversationHistory.trim() || undefined,
      subject_hints: splitHints(formState.subjectHints),
      task_hints: splitHints(formState.taskHints),
      transcript_window: transcriptWindow,
      metadata: parsedMetadata.parsed,
    });

    navigate(`/runs/${bundle.run_id}`);
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      formRef.current?.requestSubmit();
    }
  }

  return (
    <div className="page">
      <SectionTitle
        title="Runs & Workspace"
        meta="Launch orchestration runs, inspect retrieval traces, and open the final workspace bundle the runtime would consume."
        actions={
          latestRunId ? <CopyButton label="Copy latest run ID" value={latestRunId} /> : undefined
        }
      />

      <div className="grid two">
        <Panel
          title="New Workspace Run"
          description="Creates a fresh orchestration run and persists the trace in the control-plane DB."
        >
          <div className="stack">
            <div className="button-row">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  className="button-secondary button-small"
                  onClick={() => loadPreset(preset.label)}
                  type="button"
                >
                  Load {preset.label}
                </button>
              ))}
            </div>

            <form className="inline-form stack" onSubmit={handleSubmit} ref={formRef}>
              <div className="grid two">
                <label>
                  Session ID
                  <input
                    value={formState.sessionId}
                    onChange={(event) => updateField("sessionId", event.target.value)}
                    placeholder="session_task"
                  />
                </label>
                <label>
                  Runtime
                  <select
                    value={formState.runtime}
                    onChange={(event) => updateField("runtime", event.target.value)}
                  >
                    <option value="openclaw">OpenClaw</option>
                    <option value="generic">Generic</option>
                  </select>
                </label>
              </div>

              <label>
                User message
                <textarea
                  value={formState.userMessage}
                  onChange={(event) => updateField("userMessage", event.target.value)}
                  onKeyDown={handleTextareaKeyDown}
                />
              </label>
              {messageError ? <div className="field-hint field-hint-error">{messageError}</div> : null}

              <label>
                Conversation history
                <textarea
                  value={formState.conversationHistory}
                  onChange={(event) => updateField("conversationHistory", event.target.value)}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder="Optional transcript or runtime framing that should accompany retrieval."
                />
              </label>

              <div className="grid two">
                <label>
                  Subject hints
                  <input
                    value={formState.subjectHints}
                    onChange={(event) => updateField("subjectHints", event.target.value)}
                    placeholder="database migration,schema review"
                  />
                </label>
                <label>
                  Task hints
                  <input
                    value={formState.taskHints}
                    onChange={(event) => updateField("taskHints", event.target.value)}
                    placeholder="debug,execution"
                  />
                </label>
              </div>

              <div className="grid two">
                <label>
                  Transcript window
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={formState.transcriptWindow}
                    onChange={(event) => updateField("transcriptWindow", event.target.value)}
                  />
                </label>
                <label>
                  Metadata JSON
                  <textarea
                    value={formState.metadata}
                    onChange={(event) => updateField("metadata", event.target.value)}
                    onKeyDown={handleTextareaKeyDown}
                  />
                </label>
              </div>

              {transcriptWindowError ? (
                <div className="field-hint field-hint-error">{transcriptWindowError}</div>
              ) : (
                <div className="field-hint">
                  Stored locally. Use Ctrl/Cmd+Enter inside long fields to submit.
                </div>
              )}
              {parsedMetadata.error ? (
                <div className="field-hint field-hint-error">{parsedMetadata.error}</div>
              ) : null}

              {assembleWorkspace.error ? (
                <ErrorState
                  error={assembleWorkspace.error}
                  onRetry={() => formRef.current?.requestSubmit()}
                />
              ) : null}

              <div className="button-row">
                <button className="button-primary" disabled={!canSubmit} type="submit">
                  {assembleWorkspace.isPending ? "Assembling..." : "Assemble Workspace"}
                </button>
                {latestRunId ? (
                  <Link className="button-secondary" to={`/runs/${latestRunId}`}>
                    Open Latest Run
                  </Link>
                ) : null}
              </div>

              {!systemStatus.data?.ready ? (
                <div className="field-hint field-hint-error">
                  Runtime actions are disabled until Smart Memory is healthy.
                </div>
              ) : null}
            </form>
          </div>
        </Panel>

        <Panel
          title="What Gets Persisted"
          description="The orchestrator keeps run traces and bundle snapshots locally, without becoming a second memory truth layer."
        >
          <div className="grid two">
            <div className="metric">
              <span className="meta">Recorded runs</span>
              <strong>{runs.data?.items.length ?? 0}</strong>
            </div>
            <div className="metric">
              <span className="meta">Last run</span>
              <strong>{latestRunId ? latestRunId.slice(0, 8) : "n/a"}</strong>
            </div>
          </div>
          <p className="meta" style={{ marginTop: 16 }}>
            Each run stores stage traces, hook traces, the workspace snapshot, and runtime adapter previews.
          </p>
          <div className="stack" style={{ marginTop: 12 }}>
            <div className="meta">
              Subject hints: {splitHints(formState.subjectHints).length || 0} · Task hints:{" "}
              {splitHints(formState.taskHints).length || 0}
            </div>
            <div className="meta">Transcript window: {transcriptWindow || "n/a"} messages</div>
          </div>
        </Panel>
      </div>

      <Panel title="Recent Runs">
        {runs.isPending ? <LoadingState label="Loading orchestration runs..." rows={5} /> : null}
        {runs.error ? <ErrorState error={runs.error} onRetry={() => runs.refetch()} /> : null}
        {!runs.isPending && !runs.error && runs.data?.items.length === 0 ? (
          <EmptyState>No orchestration runs yet. Assemble a workspace to create the first run.</EmptyState>
        ) : null}
        {runs.data?.items.length ? (
          <ul className="list">
            {runs.data.items.map((run) => (
              <li className="list-item" key={run.run_id}>
                <div className="list-item-header">
                  <strong>
                    <Link to={`/runs/${run.run_id}`}>{run.user_message}</Link>
                  </strong>
                  <div className="button-row">
                    <CopyButton label="Copy run ID" value={run.run_id} />
                    {run.session_id ? <CopyButton label="Copy session ID" value={run.session_id} /> : null}
                  </div>
                </div>
                <div className="meta">
                  {run.runtime} · {run.status} · {formatTimestampWithRelative(run.created_at)}
                </div>
                {run.session_id ? (
                  <div className="meta">
                    session: <Link to={`/transcripts/${run.session_id}`}>{run.session_id}</Link>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </div>
  );
}
