import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useRun } from "../api/hooks";
import {
  CopyButton,
  EmptyState,
  ErrorState,
  JsonBlock,
  LoadingState,
  Panel,
  SectionTitle,
} from "../components/UiPrimitives";
import { formatTimestampWithRelative, toTitle } from "../utils/format";

type TabKey =
  | "summary"
  | "framing"
  | "retrieval"
  | "stages"
  | "hooks"
  | "adapters";

const tabOrder: TabKey[] = [
  "summary",
  "framing",
  "retrieval",
  "stages",
  "hooks",
  "adapters",
];

export function RunDetailPage() {
  const params = useParams();
  const run = useRun(params.runId);
  const [tab, setTab] = useState<TabKey>("summary");

  const workspace = run.data?.workspace;
  const slowestStage = useMemo(
    () =>
      [...(run.data?.stage_trace ?? [])].sort((left, right) => right.duration_ms - left.duration_ms)[0],
    [run.data?.stage_trace],
  );
  const slowestHook = useMemo(
    () =>
      [...(run.data?.hook_trace ?? [])].sort((left, right) => right.duration_ms - left.duration_ms)[0],
    [run.data?.hook_trace],
  );

  return (
    <div className="page">
      <SectionTitle
        title="Run Detail"
        meta="Inspect the assembled workspace bundle, retrieval decisions, stage timing, and adapter outputs for one orchestration run."
        actions={
          run.data?.summary.run_id ? (
            <CopyButton label="Copy run ID" value={run.data.summary.run_id} />
          ) : undefined
        }
      />

      {run.isPending ? <LoadingState label="Loading run detail..." rows={6} /> : null}
      {run.error ? <ErrorState error={run.error} onRetry={() => run.refetch()} /> : null}
      {!run.isPending && !run.error && !run.data ? <EmptyState>Run not found.</EmptyState> : null}

      {run.data ? (
        <>
          <div className="grid four">
            <Panel title="Runtime">
              <div className="metric">
                <span className="meta">Profile</span>
                <strong>{run.data.summary.runtime}</strong>
              </div>
              <div className="meta">{formatTimestampWithRelative(run.data.summary.created_at)}</div>
            </Panel>
            <Panel title="Retrieval">
              <div className="metric">
                <span className="meta">Candidates / selected</span>
                <strong>
                  {run.data.retrieval_trace?.candidate_count ?? 0} /{" "}
                  {run.data.retrieval_trace?.selected_count ?? 0}
                </strong>
              </div>
            </Panel>
            <Panel title="Timing">
              <div className="metric">
                <span className="meta">Slowest stage</span>
                <strong>{slowestStage ? `${slowestStage.stage}` : "n/a"}</strong>
              </div>
              <div className="meta">{slowestStage ? `${slowestStage.duration_ms} ms` : "No stages"}</div>
            </Panel>
            <Panel title="Backend">
              <span className={run.data.capabilities.healthy ? "pill ok" : "pill danger"}>
                {run.data.capabilities.healthy ? "Backend healthy" : "Backend degraded"}
              </span>
              <div className="meta" style={{ marginTop: 12 }}>
                Session: {run.data.summary.session_id ?? "n/a"}
              </div>
            </Panel>
          </div>

          <div className="tabs">
            {tabOrder.map((item) => (
              <button
                key={item}
                className={tab === item ? "active" : ""}
                onClick={() => setTab(item)}
                type="button"
              >
                {toTitle(item)}
              </button>
            ))}
          </div>

          {tab === "summary" ? (
            <div className="split">
              <div className="stack">
                <Panel title="Summary">
                  <div className="stack">
                    <div className="detail-row">
                      <span className="meta">Run ID</span>
                      <div className="detail-row-actions">
                        <span>{run.data.summary.run_id}</span>
                        <CopyButton label="Copy" value={run.data.summary.run_id} />
                      </div>
                    </div>
                    <div className="detail-row">
                      <span className="meta">Session</span>
                      <div className="detail-row-actions">
                        {run.data.summary.session_id ? (
                          <>
                            <Link to={`/transcripts/${run.data.summary.session_id}`}>
                              {run.data.summary.session_id}
                            </Link>
                            <CopyButton label="Copy" value={run.data.summary.session_id} />
                          </>
                        ) : (
                          <span>n/a</span>
                        )}
                      </div>
                    </div>
                    <div className="detail-row">
                      <span className="meta">User message</span>
                      <span>{run.data.summary.user_message}</span>
                    </div>
                    <div className="detail-row">
                      <span className="meta">Created</span>
                      <span>{formatTimestampWithRelative(run.data.summary.created_at)}</span>
                    </div>
                  </div>
                </Panel>
                <Panel title="Assembled Context">
                  {workspace?.assembled_context.text ? (
                    <pre className="code-block">{workspace.assembled_context.text}</pre>
                  ) : (
                    <EmptyState>No assembled context text was persisted for this run.</EmptyState>
                  )}
                </Panel>
              </div>

              <div className="stack">
                <Panel title="Workspace Buckets">
                  {workspace ? (
                    <div className="stack">
                      <div className="meta">
                        Active: {workspace.buckets.active_state.length} · Supporting:{" "}
                        {workspace.buckets.supporting_constraints.length} · References:{" "}
                        {workspace.buckets.references.length} · Suppressed:{" "}
                        {workspace.buckets.suppressed.length}
                      </div>
                      <JsonBlock
                        collapsed
                        filename={`${run.data.summary.run_id}-workspace-buckets.json`}
                        title="Bucket payload"
                        value={workspace.buckets}
                      />
                    </div>
                  ) : (
                    <EmptyState>No workspace snapshot was saved for this run.</EmptyState>
                  )}
                </Panel>
                <Panel title="Timing Bottlenecks">
                  <div className="stack">
                    <div className="detail-row">
                      <span className="meta">Slowest stage</span>
                      <span>
                        {slowestStage ? `${slowestStage.stage} (${slowestStage.duration_ms} ms)` : "n/a"}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="meta">Slowest hook</span>
                      <span>
                        {slowestHook
                          ? `${slowestHook.hook_name} (${slowestHook.duration_ms} ms)`
                          : "No hooks executed"}
                      </span>
                    </div>
                  </div>
                </Panel>
              </div>
            </div>
          ) : null}

          {tab === "framing" ? (
            <div className="grid two">
              <Panel title="Framing Policy">
                <JsonBlock
                  filename={`${run.data.summary.run_id}-framing-policy.json`}
                  title="Framing policy"
                  value={workspace?.framing_policy ?? run.data.framing_policy}
                />
              </Panel>
              <Panel title="Framing Notes">
                {(workspace?.framing_policy.notes ?? run.data.framing_policy?.notes)?.length ? (
                  <ul className="list">
                    {(workspace?.framing_policy.notes ?? run.data.framing_policy?.notes ?? []).map(
                      (note) => (
                        <li className="list-item" key={note}>
                          {note}
                        </li>
                      ),
                    )}
                  </ul>
                ) : (
                  <EmptyState>No framing notes were recorded.</EmptyState>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === "retrieval" ? (
            <div className="stack">
              <div className="grid two">
                <Panel title="Retrieval Summary">
                  <div className="stack">
                    <div className="detail-row">
                      <span className="meta">Query</span>
                      <span>{run.data.retrieval_trace?.query ?? "n/a"}</span>
                    </div>
                    <div className="detail-row">
                      <span className="meta">Entities</span>
                      <span>{run.data.retrieval_trace?.entities.join(", ") || "none"}</span>
                    </div>
                    <div className="detail-row">
                      <span className="meta">Candidate count</span>
                      <span>{run.data.retrieval_trace?.candidate_count ?? 0}</span>
                    </div>
                    <div className="detail-row">
                      <span className="meta">Selected count</span>
                      <span>{run.data.retrieval_trace?.selected_count ?? 0}</span>
                    </div>
                  </div>
                </Panel>
                <Panel title="Transcript Slice">
                  {run.data.transcript?.session_id ? (
                    <div className="meta" style={{ marginBottom: 12 }}>
                      session:{" "}
                      <Link to={`/transcripts/${run.data.transcript.session_id}`}>
                        {run.data.transcript.session_id}
                      </Link>
                    </div>
                  ) : null}
                  {run.data.transcript?.messages.length ? (
                    <ul className="list">
                      {run.data.transcript.messages.map((message) => (
                        <li className="list-item" key={message.message_id}>
                          <strong>
                            {message.role} · seq {message.seq_num}
                          </strong>
                          <div>{message.content}</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState>No transcript slice was saved for this run.</EmptyState>
                  )}
                </Panel>
              </div>

              <Panel title="Decision Trace">
                {run.data.retrieval_trace?.decisions.length ? (
                  <ul className="list">
                    {run.data.retrieval_trace.decisions.map((decision, index) => (
                      <li className="list-item" key={`${decision.memory.id}-${index}`}>
                        <div className="list-item-header">
                          <strong>{decision.memory.content}</strong>
                          <CopyButton label="Copy memory ID" value={decision.memory.id} />
                        </div>
                        <div className="meta">
                          {decision.bucket} · {decision.inclusion_source} · {decision.policy_rule_applied}
                        </div>
                        {decision.bucket_reason ? (
                          <div className="meta">Included because: {decision.bucket_reason}</div>
                        ) : null}
                        {decision.suppressed_reason ? (
                          <div className="meta">Suppressed because: {decision.suppressed_reason}</div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState>No retrieval decisions were recorded for this run.</EmptyState>
                )}
              </Panel>

              <Panel title="Raw Retrieval Trace">
                <JsonBlock
                  collapsed
                  filename={`${run.data.summary.run_id}-retrieval-trace.json`}
                  title="Retrieval trace JSON"
                  value={run.data.retrieval_trace}
                />
              </Panel>
            </div>
          ) : null}

          {tab === "stages" ? (
            <div className="grid two">
              <Panel title="Stage Overview">
                <div className="stack">
                  <div className="detail-row">
                    <span className="meta">Total stages</span>
                    <span>{run.data.stage_trace.length}</span>
                  </div>
                  <div className="detail-row">
                    <span className="meta">Slowest stage</span>
                    <span>
                      {slowestStage ? `${slowestStage.stage} (${slowestStage.duration_ms} ms)` : "n/a"}
                    </span>
                  </div>
                </div>
              </Panel>
              <Panel title="Stage Trace">
                {run.data.stage_trace.length ? (
                  <ul className="list">
                    {run.data.stage_trace.map((trace) => (
                      <li className="list-item" key={`${trace.stage}-${trace.started_at}`}>
                        <strong>{trace.stage}</strong>
                        <div className="meta">
                          {trace.status} · {trace.duration_ms} ms ·{" "}
                          {formatTimestampWithRelative(trace.finished_at)}
                        </div>
                        <JsonBlock
                          collapsed
                          filename={`${run.data.summary.run_id}-${trace.stage}.json`}
                          title={`${trace.stage} payload`}
                          value={trace.payload}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState>No stage traces were recorded for this run.</EmptyState>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === "hooks" ? (
            <div className="grid two">
              <Panel title="Hook Overview">
                <div className="stack">
                  <div className="detail-row">
                    <span className="meta">Executed hooks</span>
                    <span>{run.data.hook_trace.length}</span>
                  </div>
                  <div className="detail-row">
                    <span className="meta">Slowest hook</span>
                    <span>
                      {slowestHook
                        ? `${slowestHook.hook_name} (${slowestHook.duration_ms} ms)`
                        : "No hooks executed"}
                    </span>
                  </div>
                </div>
              </Panel>
              <Panel title="Hook Trace">
                {run.data.hook_trace.length === 0 ? (
                  <EmptyState>No hooks executed for this run.</EmptyState>
                ) : (
                  <ul className="list">
                    {run.data.hook_trace.map((trace) => (
                      <li className="list-item" key={`${trace.hook_name}-${trace.started_at}`}>
                        <strong>{trace.hook_name}</strong>
                        <div className="meta">
                          {trace.stage} · {trace.outcome} · {trace.duration_ms} ms
                        </div>
                        <JsonBlock
                          collapsed
                          filename={`${run.data.summary.run_id}-${trace.hook_name}.json`}
                          title={`${trace.hook_name} detail`}
                          value={trace.detail}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === "adapters" ? (
            <div className="grid two">
              <Panel title="OpenClaw Preview">
                <pre className="code-block">
                  {workspace?.adapters.openclaw?.prompt_injection ?? "No OpenClaw adapter output."}
                </pre>
              </Panel>
              <Panel title="Adapter Payloads">
                <JsonBlock
                  filename={`${run.data.summary.run_id}-adapter-payloads.json`}
                  title="Runtime adapters"
                  value={workspace?.adapters}
                />
              </Panel>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
