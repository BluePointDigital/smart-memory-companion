import { FramingPolicy, OrchestrationRequest, SmartMemoryCapabilities } from "./contracts.js";
import { uniqueStrings } from "./utils.js";

const STOP_WORDS = new Set([
  "about",
  "after",
  "before",
  "build",
  "could",
  "from",
  "have",
  "into",
  "just",
  "like",
  "need",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
]);

function deriveEntityScope(request: OrchestrationRequest): string[] {
  if (request.subject_hints && request.subject_hints.length > 0) {
    return uniqueStrings(request.subject_hints);
  }

  const tokens = request.user_message
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));

  return uniqueStrings(tokens).slice(0, 6);
}

function detectTaskMode(request: OrchestrationRequest): string {
  const text = request.user_message.toLowerCase();
  const hints = (request.task_hints ?? []).map((hint) => hint.toLowerCase());

  if (hints.includes("debug") || /debug|trace|why/.test(text)) {
    return "inspect";
  }

  if (hints.includes("history") || /remember|history|decide|previous|earlier/.test(text)) {
    return "recall";
  }

  if (hints.includes("plan") || /plan|design|architecture/.test(text)) {
    return "planning";
  }

  if (/blocked|next|todo|do this|execute/.test(text)) {
    return "execution";
  }

  return "general";
}

export function deriveFramingPolicy(
  request: OrchestrationRequest,
  capabilities: SmartMemoryCapabilities,
): FramingPolicy {
  const taskMode = detectTaskMode(request);
  const entityScope = deriveEntityScope(request);
  const includeHistory =
    taskMode === "recall" ||
    /history|earlier|previous|what did we|when did/i.test(request.user_message);

  const notes = [
    `task_mode:${taskMode}`,
    includeHistory ? "history:enabled" : "history:disabled",
  ];

  if (!capabilities.endpoints.transcripts) {
    notes.push("transcripts:unavailable");
  }

  if (!capabilities.endpoints.lanes) {
    notes.push("lanes:unavailable");
  }

  return {
    task_mode: taskMode,
    entity_scope: entityScope,
    include_history: includeHistory,
    transcript_window: request.transcript_window ?? (taskMode === "inspect" ? 24 : 12),
    admissibility_rules: [
      "prefer_active_memory",
      "prefer_core_and_working_lane_context",
      "require_query_relevance",
    ],
    contamination_rules: [
      "avoid_cross_topic_drift",
      "demote_low_relevance_episodic_items",
      "exclude_duplicate_bundle_entries",
    ],
    lane_allowances: capabilities.endpoints.lanes
      ? ["core", "working", "retrieved"]
      : ["retrieved"],
    grouping_rules: [
      "task_state_and_identity_to_active_state",
      "belief_and_semantic_to_supporting_constraints",
      "episodic_to_references",
    ],
    output_mode: request.runtime === "openclaw" ? "openclaw_preview" : "generic_bundle",
    notes,
  };
}
