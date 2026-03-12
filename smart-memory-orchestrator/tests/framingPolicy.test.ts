import { describe, expect, it } from "vitest";

import { deriveFramingPolicy } from "../src/framingPolicy.js";
import type { OrchestrationRequest, SmartMemoryCapabilities } from "../src/contracts.js";

const capabilities: SmartMemoryCapabilities = {
  base_url: "http://127.0.0.1:8000",
  healthy: true,
  health_status: "ok",
  openapi_available: true,
  version: "3.1.0",
  endpoints: {
    memories: true,
    memory_detail: true,
    memory_history: true,
    memory_chain: true,
    memory_evidence: true,
    retrieve: true,
    transcripts: true,
    transcript_message: true,
    lanes: true,
    rebuild: true,
    rebuild_session: true,
    ingest: true,
    append_transcript: true,
  },
  degraded: [],
};

describe("deriveFramingPolicy", () => {
  it("enables history mode for recall-oriented questions", () => {
    const request: OrchestrationRequest = {
      user_message: "What did we decide earlier about the migration?",
      runtime: "generic",
      conversation_history: "",
      subject_hints: [],
      task_hints: [],
      metadata: {},
    };

    const policy = deriveFramingPolicy(request, capabilities);

    expect(policy.task_mode).toBe("recall");
    expect(policy.include_history).toBe(true);
    expect(policy.entity_scope.length).toBeGreaterThan(0);
  });
});
