import {
  BucketCollection,
  FramingPolicy,
  HookTrace,
  OrchestrationRequest,
  RetrievalResult,
  TranscriptMessage,
  WorkspaceBundle,
} from "./contracts.js";
import { durationMs, nowIso } from "./utils.js";

export type HookStage =
  | "before_ingest"
  | "after_ingest"
  | "before_retrieval"
  | "after_retrieval"
  | "before_output";

export type HookOutcome = {
  outcome: "modified" | "noop";
  detail?: Record<string, unknown>;
};

export type HookContext = {
  stage: HookStage;
  request?: OrchestrationRequest;
  policy?: FramingPolicy;
  retrievalResult?: RetrievalResult;
  transcriptMessages?: TranscriptMessage[];
  buckets?: BucketCollection;
  bundle?: WorkspaceBundle;
};

export type OrchestratorHook = {
  name: string;
  stages: HookStage[];
  execute(context: HookContext): Promise<HookOutcome> | HookOutcome;
};

export const subjectHintsHook: OrchestratorHook = {
  name: "subject-hints",
  stages: ["before_retrieval"],
  execute(context) {
    if (!context.request?.subject_hints?.length || !context.policy) {
      return { outcome: "noop" };
    }

    const merged = [...context.policy.entity_scope, ...context.request.subject_hints];
    context.policy.entity_scope = [...new Set(merged)];
    context.policy.notes = [...context.policy.notes, "hook:subject_hints"];
    return {
      outcome: "modified",
      detail: {
        entity_scope: context.policy.entity_scope,
      },
    };
  },
};

export const episodicReferenceHook: OrchestratorHook = {
  name: "episodic-reference-demotion",
  stages: ["after_retrieval"],
  execute(context) {
    if (!context.buckets) {
      return { outcome: "noop" };
    }

    const activeBefore = context.buckets.active_state.length;
    const moved = context.buckets.active_state.filter((memory) =>
      (memory.memory_type ?? memory.type ?? "").toLowerCase() === "episodic",
    );

    if (moved.length === 0) {
      return { outcome: "noop" };
    }

    context.buckets.active_state = context.buckets.active_state.filter(
      (memory) => !moved.some((candidate) => candidate.id === memory.id),
    );
    context.buckets.references = [...context.buckets.references, ...moved];

    return {
      outcome: "modified",
      detail: {
        moved_count: moved.length,
        active_before: activeBefore,
        active_after: context.buckets.active_state.length,
      },
    };
  },
};

export const bundleSummaryHook: OrchestratorHook = {
  name: "bundle-summary-note",
  stages: ["before_output"],
  execute(context) {
    if (!context.bundle) {
      return { outcome: "noop" };
    }

    const note = `bundle:active=${context.bundle.buckets.active_state.length};supporting=${context.bundle.buckets.supporting_constraints.length}`;
    context.bundle.framing_policy.notes = [...context.bundle.framing_policy.notes, note];
    return {
      outcome: "modified",
      detail: {
        note,
      },
    };
  },
};

export async function executeHooks(params: {
  stage: HookStage;
  hooks: OrchestratorHook[];
  context: HookContext;
  onTrace?(trace: HookTrace): void;
}): Promise<HookTrace[]> {
  const traces: HookTrace[] = [];

  for (const hook of params.hooks.filter((item) => item.stages.includes(params.stage))) {
    const started = Date.now();
    const startedAt = nowIso();
    const result = await hook.execute(params.context);
    const finished = Date.now();
    const trace: HookTrace = {
      stage: params.stage,
      hook_name: hook.name,
      outcome: result.outcome,
      started_at: startedAt,
      finished_at: nowIso(),
      duration_ms: durationMs(started, finished),
      detail: result.detail ?? {},
    };

    traces.push(trace);
    params.onTrace?.(trace);
  }

  return traces;
}
