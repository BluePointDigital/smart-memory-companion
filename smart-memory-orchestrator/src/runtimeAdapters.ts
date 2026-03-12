import {
  RuntimeAdapters,
  RuntimeAdapterOutput,
  WorkspaceBundle,
} from "./contracts.js";
import config from "./config.js";

function summarizeList(items: string[]): string {
  return items.length > 0 ? items.join("\n") : "- none";
}

export function buildOpenClawAdapter(bundle: WorkspaceBundle): RuntimeAdapterOutput {
  const payload = {
    run_id: bundle.run_id,
    framing_policy: bundle.framing_policy,
    active_state: bundle.buckets.active_state,
    supporting_constraints: bundle.buckets.supporting_constraints,
    references: bundle.buckets.references,
    recent_transcript: bundle.transcript.messages,
  };

  const promptInjection = [
    "[Smart Memory Companion]",
    "",
    "[Active State]",
    summarizeList(bundle.assembled_context.sections.active_state),
    "",
    "[Supporting Constraints]",
    summarizeList(bundle.assembled_context.sections.supporting_constraints),
    "",
    "[References]",
    summarizeList(bundle.assembled_context.sections.references),
    "",
    "[Recent Transcript]",
    summarizeList(bundle.assembled_context.sections.recent_transcript),
  ].join("\n");

  return {
    runtime: "openclaw",
    summary: "OpenClaw prompt injection preview",
    prompt_injection: promptInjection,
    payload,
  };
}

export function buildRuntimeAdapters(bundle: WorkspaceBundle): RuntimeAdapters {
  const adapters: RuntimeAdapters = {
    generic: {
      runtime: "generic",
      summary: "Generic JSON workspace bundle",
      payload: {
        run_id: bundle.run_id,
        request: bundle.request,
        framing_policy: bundle.framing_policy,
        lane_snapshots: bundle.lane_snapshots,
        transcript: bundle.transcript,
        retrieval_trace: bundle.retrieval_trace,
        buckets: bundle.buckets,
        assembled_context: bundle.assembled_context,
      },
    },
  };

  if (config.runtimeAdapters.openclaw.enabled) {
    adapters.openclaw = buildOpenClawAdapter(bundle);
  }

  return adapters;
}
