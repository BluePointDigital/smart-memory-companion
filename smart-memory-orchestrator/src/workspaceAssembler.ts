import {
  AssembledContext,
  BucketCollection,
  FramingPolicy,
  HookTrace,
  LaneSnapshots,
  OrchestrationRequest,
  RetrievalTrace,
  RuntimeAdapters,
  SmartMemoryCapabilities,
  StageTrace,
  TranscriptSlice,
  WorkspaceBundle,
} from "./contracts.js";
import { buildRuntimeAdapters } from "./runtimeAdapters.js";
import { nowIso } from "./utils.js";

function toSectionLines(items: { content: string }[]): string[] {
  return items.map((item) => item.content.trim()).filter(Boolean);
}

export function assembleContext(params: {
  buckets: BucketCollection;
  transcript: TranscriptSlice;
}): AssembledContext {
  const sections = {
    active_state: toSectionLines(params.buckets.active_state),
    supporting_constraints: toSectionLines(params.buckets.supporting_constraints),
    references: toSectionLines(params.buckets.references),
    recent_transcript: params.transcript.messages
      .slice(-8)
      .map((message) => `${message.role}: ${message.content}`),
  };

  const text = [
    "Active State",
    ...sections.active_state.map((item) => `- ${item}`),
    "",
    "Supporting Constraints",
    ...sections.supporting_constraints.map((item) => `- ${item}`),
    "",
    "References",
    ...sections.references.map((item) => `- ${item}`),
    "",
    "Recent Transcript",
    ...sections.recent_transcript.map((item) => `- ${item}`),
  ]
    .filter(Boolean)
    .join("\n");

  return { sections, text };
}

export function assembleWorkspaceBundle(params: {
  runId: string;
  request: OrchestrationRequest;
  capabilities: SmartMemoryCapabilities;
  policy: FramingPolicy;
  laneSnapshots: LaneSnapshots;
  transcript: TranscriptSlice;
  retrievalTrace: RetrievalTrace;
  buckets: BucketCollection;
  stageTrace: StageTrace[];
  hookTrace: HookTrace[];
}): WorkspaceBundle {
  const assembledContext = assembleContext({
    buckets: params.buckets,
    transcript: params.transcript,
  });

  const draftBundle: WorkspaceBundle = {
    run_id: params.runId,
    created_at: nowIso(),
    request: params.request,
    capabilities: params.capabilities,
    framing_policy: params.policy,
    lane_snapshots: params.laneSnapshots,
    transcript: params.transcript,
    retrieval_trace: params.retrievalTrace,
    buckets: params.buckets,
    assembled_context: assembledContext,
    adapters: {
      generic: {
        runtime: "generic",
        summary: "Generic JSON workspace bundle",
        payload: {},
      },
    },
    stage_trace: params.stageTrace,
    hook_trace: params.hookTrace,
  };

  const adapters: RuntimeAdapters = buildRuntimeAdapters(draftBundle);
  draftBundle.adapters = adapters;

  return draftBundle;
}
