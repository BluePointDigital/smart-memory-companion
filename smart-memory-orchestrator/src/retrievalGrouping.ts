import {
  BucketCollection,
  RetrievalCandidate,
  RetrievalDecision,
  RankedCandidate,
  SmartMemoryMemory,
} from "./contracts.js";

type BucketName = keyof BucketCollection;

function dedupeMemories(items: SmartMemoryMemory[]): SmartMemoryMemory[] {
  const seen = new Set<string>();
  const output: SmartMemoryMemory[] = [];

  for (const item of items) {
    if (!item.id || seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    output.push(item);
  }

  return output;
}

function memoryType(memory: SmartMemoryMemory): string {
  return (memory.memory_type ?? memory.type ?? "unknown").toLowerCase();
}

function createDecision(params: {
  memory: SmartMemoryMemory;
  bucket: BucketName;
  included: boolean;
  bucketReason?: string;
  suppressedReason?: string;
  inclusionSource: string;
  policyRuleApplied: string;
  score?: number;
  vectorScore?: number;
}): RetrievalDecision {
  return {
    memory: params.memory,
    bucket: params.bucket,
    included: params.included,
    bucket_reason: params.bucketReason,
    suppressed_reason: params.suppressedReason,
    inclusion_source: params.inclusionSource,
    policy_rule_applied: params.policyRuleApplied,
    score: params.score,
    vector_score: params.vectorScore,
  };
}

export function groupRetrievedMemories(params: {
  core: SmartMemoryMemory[];
  working: SmartMemoryMemory[];
  selected: RankedCandidate[];
  candidates: RetrievalCandidate[];
}): {
  buckets: BucketCollection;
  decisions: RetrievalDecision[];
} {
  const activeState: SmartMemoryMemory[] = [...params.working];
  const supportingConstraints: SmartMemoryMemory[] = [];
  const references: SmartMemoryMemory[] = [];
  const suppressed: SmartMemoryMemory[] = [];
  const decisions: RetrievalDecision[] = [];

  for (const memory of params.working) {
    decisions.push(
      createDecision({
        memory,
        bucket: "active_state",
        included: true,
        bucketReason: "working lane memory is treated as active task state",
        inclusionSource: "lane:working",
        policyRuleApplied: "prefer_core_and_working_lane_context",
      }),
    );
  }

  for (const memory of params.core) {
    const kind = memoryType(memory);
    if (kind === "identity" || kind === "task_state" || kind === "preference") {
      activeState.push(memory);
      decisions.push(
        createDecision({
          memory,
          bucket: "active_state",
          included: true,
          bucketReason: "core lane state was promoted into active state",
          inclusionSource: "lane:core",
          policyRuleApplied: "prefer_core_and_working_lane_context",
        }),
      );
    } else {
      supportingConstraints.push(memory);
      decisions.push(
        createDecision({
          memory,
          bucket: "supporting_constraints",
          included: true,
          bucketReason: "core lane memory was treated as supporting context",
          inclusionSource: "lane:core",
          policyRuleApplied: "prefer_core_and_working_lane_context",
        }),
      );
    }
  }

  const selectedIds = new Set(params.selected.map((item) => item.memory.id));

  for (const ranked of params.selected) {
    const memory = ranked.memory;
    const kind = memoryType(memory);

    if (kind === "episodic") {
      references.push(memory);
      decisions.push(
        createDecision({
          memory,
          bucket: "references",
          included: true,
          bucketReason: "episodic retrieval was demoted into references",
          inclusionSource: "retrieve:selected",
          policyRuleApplied: "episodic_to_references",
          score: ranked.score,
          vectorScore: ranked.vector_score,
        }),
      );
      continue;
    }

    if (kind === "belief" || kind === "semantic") {
      supportingConstraints.push(memory);
      decisions.push(
        createDecision({
          memory,
          bucket: "supporting_constraints",
          included: true,
          bucketReason: "semantic or belief retrieval was grouped as supporting context",
          inclusionSource: "retrieve:selected",
          policyRuleApplied: "belief_and_semantic_to_supporting_constraints",
          score: ranked.score,
          vectorScore: ranked.vector_score,
        }),
      );
      continue;
    }

    activeState.push(memory);
    decisions.push(
      createDecision({
        memory,
        bucket: "active_state",
        included: true,
        bucketReason: "selected retrieval contributes directly to active task state",
        inclusionSource: "retrieve:selected",
        policyRuleApplied: "task_state_and_identity_to_active_state",
        score: ranked.score,
        vectorScore: ranked.vector_score,
      }),
    );
  }

  for (const ranked of params.candidates) {
    if (!selectedIds.has(ranked.memory.id)) {
      suppressed.push(ranked.memory);
      decisions.push(
        createDecision({
          memory: ranked.memory,
          bucket: "suppressed",
          included: false,
          suppressedReason:
            "candidate was returned by Smart Memory but not selected into the final workspace",
          inclusionSource: "retrieve:candidate",
          policyRuleApplied: "require_query_relevance",
          vectorScore: ranked.vector_score,
        }),
      );
    }
  }

  return {
    buckets: {
      active_state: dedupeMemories(activeState),
      supporting_constraints: dedupeMemories(supportingConstraints),
      references: dedupeMemories(references),
      suppressed: dedupeMemories(suppressed),
    },
    decisions,
  };
}
