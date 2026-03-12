import { Static, Type } from "@sinclair/typebox";

const MetadataSchema = Type.Record(Type.String(), Type.Any(), {
  additionalProperties: true,
  default: {},
});

export const SmartMemoryHealthSchema = Type.Object({
  status: Type.String(),
  embedder_loaded: Type.Optional(Type.Boolean()),
  embedder_model: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  embedder_backend: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

export const SmartMemoryCapabilitiesSchema = Type.Object({
  base_url: Type.String({ format: "uri-reference" }),
  healthy: Type.Boolean(),
  health_status: Type.String(),
  openapi_available: Type.Boolean(),
  version: Type.Optional(Type.String()),
  endpoints: Type.Object({
    memories: Type.Boolean(),
    memory_detail: Type.Boolean(),
    memory_history: Type.Boolean(),
    memory_chain: Type.Boolean(),
    memory_evidence: Type.Boolean(),
    retrieve: Type.Boolean(),
    transcripts: Type.Boolean(),
    transcript_message: Type.Boolean(),
    lanes: Type.Boolean(),
    rebuild: Type.Boolean(),
    rebuild_session: Type.Boolean(),
    ingest: Type.Boolean(),
    append_transcript: Type.Boolean(),
  }),
  degraded: Type.Array(Type.String()),
});

export const SmartMemoryMemorySchema = Type.Object({
  id: Type.String(),
  memory_type: Type.Optional(Type.String()),
  type: Type.Optional(Type.String()),
  status: Type.Optional(Type.String()),
  content: Type.String(),
  importance_score: Type.Optional(Type.Number()),
  importance: Type.Optional(Type.Number()),
  confidence: Type.Optional(Type.Number()),
  source_session_id: Type.Optional(Type.String()),
  source_message_ids: Type.Optional(Type.Array(Type.String())),
  entities: Type.Array(Type.String(), { default: [] }),
  retrieval_tags: Type.Optional(Type.Array(Type.String())),
  lane_eligibility: Type.Optional(Type.Array(Type.String())),
  evidence_count: Type.Optional(Type.Number()),
  updated_at: Type.Optional(Type.String()),
  created_at: Type.Optional(Type.String()),
  raw: Type.Optional(Type.Any()),
});

export const TranscriptMessageSchema = Type.Object({
  message_id: Type.String(),
  session_id: Type.String(),
  seq_num: Type.Number(),
  role: Type.String(),
  source_type: Type.String(),
  content: Type.String(),
  created_at: Type.String(),
  tool_name: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  parent_message_id: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  metadata: Type.Optional(MetadataSchema),
  raw: Type.Optional(Type.Any()),
});

export const MemoryEvidenceSchema = Type.Object({
  memory_id: Type.String(),
  message_id: Type.String(),
  evidence_kind: Type.String(),
  confidence: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  span_start: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  span_end: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  message: Type.Optional(Type.Union([TranscriptMessageSchema, Type.Null()])),
  raw: Type.Optional(Type.Any()),
});

export const RetrievalCandidateSchema = Type.Object({
  memory: SmartMemoryMemorySchema,
  vector_score: Type.Number(),
  lane_boost: Type.Optional(Type.Number()),
});

export const RankedCandidateSchema = Type.Object({
  memory: SmartMemoryMemorySchema,
  score: Type.Number(),
  vector_score: Type.Optional(Type.Number()),
});

export const RetrievalDecisionSchema = Type.Object({
  memory: SmartMemoryMemorySchema,
  bucket: Type.String(),
  included: Type.Boolean(),
  bucket_reason: Type.Optional(Type.String()),
  suppressed_reason: Type.Optional(Type.String()),
  inclusion_source: Type.String(),
  policy_rule_applied: Type.String(),
  score: Type.Optional(Type.Number()),
  vector_score: Type.Optional(Type.Number()),
});

export const RetrievalResultSchema = Type.Object({
  user_message: Type.String(),
  entities: Type.Array(Type.String()),
  candidates: Type.Array(RetrievalCandidateSchema),
  selected: Type.Array(RankedCandidateSchema),
  degraded: Type.Boolean(),
  error: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  raw: Type.Optional(Type.Any()),
});

export const KnownSessionSchema = Type.Object({
  session_id: Type.String(),
  label: Type.String(),
  source: Type.String(),
  last_seen_at: Type.String(),
  metadata: MetadataSchema,
});

export const FramingPolicySchema = Type.Object({
  task_mode: Type.String(),
  entity_scope: Type.Array(Type.String()),
  include_history: Type.Boolean(),
  transcript_window: Type.Number(),
  admissibility_rules: Type.Array(Type.String()),
  contamination_rules: Type.Array(Type.String()),
  lane_allowances: Type.Array(Type.String()),
  grouping_rules: Type.Array(Type.String()),
  output_mode: Type.String(),
  notes: Type.Array(Type.String()),
});

export const OrchestrationRequestSchema = Type.Object({
  session_id: Type.Optional(Type.String()),
  user_message: Type.String({ minLength: 1 }),
  runtime: Type.String({ default: "generic" }),
  conversation_history: Type.Optional(Type.String({ default: "" })),
  subject_hints: Type.Optional(Type.Array(Type.String(), { default: [] })),
  task_hints: Type.Optional(Type.Array(Type.String(), { default: [] })),
  transcript_window: Type.Optional(Type.Number({ minimum: 1, maximum: 200 })),
  metadata: Type.Optional(MetadataSchema),
});

export const IngestTurnRequestSchema = Type.Object({
  user_message: Type.String({ minLength: 1 }),
  assistant_message: Type.String({ minLength: 1 }),
  source_session_id: Type.Optional(Type.String()),
  timestamp: Type.Optional(Type.String()),
});

export const IngestMessageRequestSchema = Type.Object({
  session_id: Type.Optional(Type.String()),
  role: Type.String({ minLength: 1 }),
  source_type: Type.String({ minLength: 1 }),
  content: Type.String({ minLength: 1 }),
  created_at: Type.Optional(Type.String()),
  tool_name: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  parent_message_id: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  metadata: Type.Optional(MetadataSchema),
  label: Type.Optional(Type.String()),
});

export const StageTraceSchema = Type.Object({
  stage: Type.String(),
  status: Type.String(),
  started_at: Type.String(),
  finished_at: Type.String(),
  duration_ms: Type.Number(),
  payload: MetadataSchema,
});

export const HookTraceSchema = Type.Object({
  stage: Type.String(),
  hook_name: Type.String(),
  outcome: Type.String(),
  started_at: Type.String(),
  finished_at: Type.String(),
  duration_ms: Type.Number(),
  detail: MetadataSchema,
});

export const RetrievalTraceSchema = Type.Object({
  query: Type.String(),
  entities: Type.Array(Type.String()),
  candidate_count: Type.Number(),
  selected_count: Type.Number(),
  notes: Type.Array(Type.String()),
  candidates: Type.Array(RetrievalCandidateSchema),
  selected: Type.Array(RankedCandidateSchema),
  decisions: Type.Array(RetrievalDecisionSchema),
});

export const BucketCollectionSchema = Type.Object({
  active_state: Type.Array(SmartMemoryMemorySchema),
  supporting_constraints: Type.Array(SmartMemoryMemorySchema),
  references: Type.Array(SmartMemoryMemorySchema),
  suppressed: Type.Array(SmartMemoryMemorySchema),
});

export const LaneSnapshotsSchema = Type.Object({
  core: Type.Array(SmartMemoryMemorySchema),
  working: Type.Array(SmartMemoryMemorySchema),
});

export const TranscriptSliceSchema = Type.Object({
  session_id: Type.Optional(Type.String()),
  messages: Type.Array(TranscriptMessageSchema),
});

export const AssembledContextSchema = Type.Object({
  sections: Type.Object({
    active_state: Type.Array(Type.String()),
    supporting_constraints: Type.Array(Type.String()),
    references: Type.Array(Type.String()),
    recent_transcript: Type.Array(Type.String()),
  }),
  text: Type.String(),
});

export const RuntimeAdapterOutputSchema = Type.Object({
  runtime: Type.String(),
  summary: Type.String(),
  prompt_injection: Type.Optional(Type.String()),
  payload: Type.Any(),
});

export const RuntimeAdaptersSchema = Type.Object({
  generic: RuntimeAdapterOutputSchema,
  openclaw: Type.Optional(RuntimeAdapterOutputSchema),
});

export const WorkspaceBundleSchema = Type.Object({
  run_id: Type.String(),
  created_at: Type.String(),
  request: OrchestrationRequestSchema,
  capabilities: SmartMemoryCapabilitiesSchema,
  framing_policy: FramingPolicySchema,
  lane_snapshots: LaneSnapshotsSchema,
  transcript: TranscriptSliceSchema,
  retrieval_trace: RetrievalTraceSchema,
  buckets: BucketCollectionSchema,
  assembled_context: AssembledContextSchema,
  adapters: RuntimeAdaptersSchema,
  stage_trace: Type.Array(StageTraceSchema),
  hook_trace: Type.Array(HookTraceSchema),
});

export const RunSummarySchema = Type.Object({
  run_id: Type.String(),
  session_id: Type.Optional(Type.String()),
  runtime: Type.String(),
  user_message: Type.String(),
  status: Type.String(),
  created_at: Type.String(),
  updated_at: Type.String(),
});

export const RunDetailSchema = Type.Object({
  summary: RunSummarySchema,
  capabilities: SmartMemoryCapabilitiesSchema,
  framing_policy: Type.Optional(FramingPolicySchema),
  retrieval_trace: Type.Optional(RetrievalTraceSchema),
  transcript: Type.Optional(TranscriptSliceSchema),
  workspace: Type.Optional(WorkspaceBundleSchema),
  stage_trace: Type.Array(StageTraceSchema),
  hook_trace: Type.Array(HookTraceSchema),
});

export const HealthResponseSchema = Type.Object({
  status: Type.String(),
  service: Type.String(),
  ready: Type.Boolean(),
});

export const SystemStatusSchema = Type.Object({
  status: Type.String(),
  service: Type.String(),
  ready: Type.Boolean(),
  last_checked_at: Type.String(),
  startup_errors: Type.Array(Type.String()),
  smart_memory: Type.Object({
    base_url: Type.String({ format: "uri-reference" }),
    start_mode: Type.String(),
    state: Type.String(),
    healthy: Type.Boolean(),
    owns_process: Type.Boolean(),
    last_error: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    project_root: Type.String(),
    capabilities: SmartMemoryCapabilitiesSchema,
  }),
  ui_serving: Type.Object({
    mode: Type.String(),
    available: Type.Boolean(),
    dist_path: Type.Optional(Type.String()),
    dev_server_url: Type.Optional(Type.String()),
  }),
  urls: Type.Object({
    orchestrator: Type.String(),
    api_base: Type.String(),
    ui: Type.String(),
    smart_memory: Type.String(),
  }),
});

export const ActionResultSchema = Type.Object({
  ok: Type.Boolean(),
  action: Type.String(),
  detail: MetadataSchema,
});

export const RebuildDiffSummarySchema = Type.Object({
  before: Type.Object({
    memories_total: Type.Number(),
    by_status: MetadataSchema,
    lanes: MetadataSchema,
  }),
  after: Type.Object({
    memories_total: Type.Number(),
    by_status: MetadataSchema,
    lanes: MetadataSchema,
  }),
});

export const RebuildActionResponseSchema = Type.Object({
  ok: Type.Boolean(),
  scope: Type.String(),
  report: Type.Any(),
  diff: RebuildDiffSummarySchema,
});

export const KnownSessionsResponseSchema = Type.Object({
  items: Type.Array(KnownSessionSchema),
});

export const RunsResponseSchema = Type.Object({
  items: Type.Array(RunSummarySchema),
});

export const MemoriesResponseSchema = Type.Object({
  items: Type.Array(SmartMemoryMemorySchema),
});

export const TranscriptResponseSchema = Type.Object({
  session_id: Type.String(),
  messages: Type.Array(TranscriptMessageSchema),
});

export const IngestResponseSchema = Type.Object({
  ok: Type.Boolean(),
  operation_id: Type.String(),
  session_id: Type.Optional(Type.String()),
  source: Type.String(),
  result: Type.Any(),
  stage_trace: Type.Array(StageTraceSchema),
  hook_trace: Type.Array(HookTraceSchema),
});

export type SmartMemoryHealth = Static<typeof SmartMemoryHealthSchema>;
export type SmartMemoryCapabilities = Static<typeof SmartMemoryCapabilitiesSchema>;
export type SmartMemoryMemory = Static<typeof SmartMemoryMemorySchema>;
export type TranscriptMessage = Static<typeof TranscriptMessageSchema>;
export type MemoryEvidence = Static<typeof MemoryEvidenceSchema>;
export type RetrievalCandidate = Static<typeof RetrievalCandidateSchema>;
export type RankedCandidate = Static<typeof RankedCandidateSchema>;
export type RetrievalDecision = Static<typeof RetrievalDecisionSchema>;
export type RetrievalResult = Static<typeof RetrievalResultSchema>;
export type KnownSession = Static<typeof KnownSessionSchema>;
export type FramingPolicy = Static<typeof FramingPolicySchema>;
export type OrchestrationRequest = Static<typeof OrchestrationRequestSchema>;
export type IngestTurnRequest = Static<typeof IngestTurnRequestSchema>;
export type IngestMessageRequest = Static<typeof IngestMessageRequestSchema>;
export type StageTrace = Static<typeof StageTraceSchema>;
export type HookTrace = Static<typeof HookTraceSchema>;
export type RetrievalTrace = Static<typeof RetrievalTraceSchema>;
export type BucketCollection = Static<typeof BucketCollectionSchema>;
export type LaneSnapshots = Static<typeof LaneSnapshotsSchema>;
export type TranscriptSlice = Static<typeof TranscriptSliceSchema>;
export type AssembledContext = Static<typeof AssembledContextSchema>;
export type RuntimeAdapterOutput = Static<typeof RuntimeAdapterOutputSchema>;
export type RuntimeAdapters = Static<typeof RuntimeAdaptersSchema>;
export type WorkspaceBundle = Static<typeof WorkspaceBundleSchema>;
export type RunSummary = Static<typeof RunSummarySchema>;
export type RunDetail = Static<typeof RunDetailSchema>;
export type HealthResponse = Static<typeof HealthResponseSchema>;
export type SystemStatus = Static<typeof SystemStatusSchema>;
export type ActionResult = Static<typeof ActionResultSchema>;
export type RebuildActionResponse = Static<typeof RebuildActionResponseSchema>;
export type KnownSessionsResponse = Static<typeof KnownSessionsResponseSchema>;
export type RunsResponse = Static<typeof RunsResponseSchema>;
export type MemoriesResponse = Static<typeof MemoriesResponseSchema>;
export type TranscriptResponse = Static<typeof TranscriptResponseSchema>;
export type IngestResponse = Static<typeof IngestResponseSchema>;
