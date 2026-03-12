import {
  MemoryEvidence,
  RankedCandidate,
  RetrievalCandidate,
  RetrievalResult,
  SmartMemoryCapabilities,
  SmartMemoryHealth,
  SmartMemoryMemory,
  TranscriptMessage,
} from "./contracts.js";
import { arrayify, compactObject, toRecord, uniqueStrings } from "./utils.js";

type FetchInit = RequestInit & {
  allowNotFound?: boolean;
};

export class SmartMemoryClient {
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async fetchHealth(): Promise<SmartMemoryHealth> {
    const payload = await this.fetchJson("/health");
    const record = toRecord(payload);

    return {
      status: String(record.status ?? "unknown"),
      embedder_loaded:
        typeof record.embedder_loaded === "boolean"
          ? record.embedder_loaded
          : undefined,
      embedder_model:
        typeof record.embedder_model === "string" || record.embedder_model === null
          ? (record.embedder_model as string | null)
          : undefined,
      embedder_backend:
        typeof record.embedder_backend === "string" || record.embedder_backend === null
          ? (record.embedder_backend as string | null)
          : undefined,
    };
  }

  async probeCapabilities(): Promise<SmartMemoryCapabilities> {
    let healthStatus = "offline";
    let healthy = false;
    let openapiAvailable = false;
    let version: string | undefined;
    const endpoints = {
      memories: false,
      memory_detail: false,
      memory_history: false,
      memory_chain: false,
      memory_evidence: false,
      retrieve: false,
      transcripts: false,
      transcript_message: false,
      lanes: false,
      rebuild: false,
      rebuild_session: false,
      ingest: false,
      append_transcript: false,
    };

    try {
      const health = await this.fetchHealth();
      healthStatus = health.status;
      healthy = health.status === "ok" || health.status === "degraded";
    } catch {
      return {
        base_url: this.baseUrl,
        healthy: false,
        health_status: "offline",
        openapi_available: false,
        version: undefined,
        endpoints,
        degraded: ["health"],
      };
    }

    try {
      const openApi = await this.fetchJson("/openapi.json");
      const record = toRecord(openApi);
      const paths = toRecord(record.paths);
      version = typeof record.openapi === "string" ? record.openapi : undefined;
      openapiAvailable = true;

      endpoints.memories = "/memories" in paths;
      endpoints.memory_detail = "/memory/{memory_id}" in paths;
      endpoints.memory_history = "/memory/{memory_id}/history" in paths;
      endpoints.memory_chain = "/memory/{memory_id}/chain" in paths;
      endpoints.memory_evidence = "/memory/{memory_id}/evidence" in paths;
      endpoints.retrieve = "/retrieve" in paths;
      endpoints.transcripts = "/transcripts/{session_id}" in paths;
      endpoints.transcript_message = "/transcript/message/{message_id}" in paths;
      endpoints.lanes = "/lanes/{lane_name}" in paths;
      endpoints.rebuild = "/rebuild" in paths;
      endpoints.rebuild_session = "/rebuild/{session_id}" in paths;
      endpoints.ingest = "/ingest" in paths;
      endpoints.append_transcript = "/transcripts/message" in paths;
    } catch {
      // OpenAPI is optional for the probe; feature flags remain false.
    }

    const degraded = Object.entries(endpoints)
      .filter(([, enabled]) => !enabled)
      .map(([name]) => name);

    return {
      base_url: this.baseUrl,
      healthy,
      health_status: healthStatus,
      openapi_available: openapiAvailable,
      version,
      endpoints,
      degraded,
    };
  }

  async listMemories(memoryType?: string): Promise<SmartMemoryMemory[]> {
    const path = memoryType
      ? `/memories?type=${encodeURIComponent(memoryType)}`
      : "/memories";
    const payload = await this.fetchJson(path);
    return arrayify(payload, (item) => this.normalizeMemory(item));
  }

  async getMemory(memoryId: string): Promise<SmartMemoryMemory | null> {
    const payload = await this.fetchJson(`/memory/${encodeURIComponent(memoryId)}`, {
      allowNotFound: true,
    });

    if (payload === null) {
      return null;
    }

    return this.normalizeMemory(payload);
  }

  async getMemoryChain(memoryId: string): Promise<SmartMemoryMemory[]> {
    const payload = await this.fetchJson(`/memory/${encodeURIComponent(memoryId)}/chain`, {
      allowNotFound: true,
    });
    return arrayify(payload, (item) => {
      const record = toRecord(item);
      return this.normalizeMemory(record.memory ?? record);
    });
  }

  async getMemoryHistory(memoryId: string): Promise<SmartMemoryMemory[]> {
    const payload = await this.fetchJson(
      `/memory/${encodeURIComponent(memoryId)}/history`,
      {
        allowNotFound: true,
      },
    );
    return arrayify(payload, (item) => {
      const record = toRecord(item);
      return this.normalizeMemory(record.memory ?? record);
    });
  }

  async getMemoryEvidence(memoryId: string): Promise<MemoryEvidence[]> {
    const payload = await this.fetchJson(
      `/memory/${encodeURIComponent(memoryId)}/evidence`,
      {
        allowNotFound: true,
      },
    );
    return arrayify(payload, (item) => this.normalizeEvidence(item));
  }

  async retrieve(params: {
    userMessage: string;
    conversationHistory?: string;
    includeHistory?: boolean;
    entityScope?: string[];
  }): Promise<RetrievalResult> {
    const payload = await this.fetchJson("/retrieve", {
      method: "POST",
      body: JSON.stringify({
        user_message: params.userMessage,
        conversation_history: params.conversationHistory ?? "",
        include_history: params.includeHistory ?? false,
        entity_scope: params.entityScope ?? [],
      }),
    });
    const record = toRecord(payload);

    return {
      user_message: String(record.user_message ?? params.userMessage),
      entities: arrayify(record.entities, (item) => String(item)),
      candidates: arrayify(record.candidates, (item) => this.normalizeCandidate(item)),
      selected: arrayify(record.selected, (item) => this.normalizeRankedCandidate(item)),
      degraded: Boolean(record.degraded),
      error:
        typeof record.error === "string" || record.error === null
          ? (record.error as string | null)
          : undefined,
      raw: payload,
    };
  }

  async getLane(laneName: string): Promise<SmartMemoryMemory[]> {
    const payload = await this.fetchJson(`/lanes/${encodeURIComponent(laneName)}`, {
      allowNotFound: true,
    });
    return arrayify(payload, (item) => this.normalizeMemory(item));
  }

  async getTranscript(sessionId: string): Promise<TranscriptMessage[]> {
    const payload = await this.fetchJson(`/transcripts/${encodeURIComponent(sessionId)}`, {
      allowNotFound: true,
    });
    return arrayify(payload, (item) => this.normalizeTranscriptMessage(item));
  }

  async getTranscriptMessage(messageId: string): Promise<TranscriptMessage | null> {
    const payload = await this.fetchJson(
      `/transcript/message/${encodeURIComponent(messageId)}`,
      {
        allowNotFound: true,
      },
    );

    if (payload === null) {
      return null;
    }

    return this.normalizeTranscriptMessage(payload);
  }

  async ingestTurn(payload: Record<string, unknown>): Promise<unknown> {
    return this.fetchJson("/ingest", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async appendTranscriptMessage(payload: Record<string, unknown>): Promise<unknown> {
    return this.fetchJson("/transcripts/message", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async rebuildAll(): Promise<unknown> {
    return this.fetchJson("/rebuild", { method: "POST", body: "{}" });
  }

  async rebuildSession(sessionId: string): Promise<unknown> {
    return this.fetchJson(`/rebuild/${encodeURIComponent(sessionId)}`, {
      method: "POST",
      body: "{}",
    });
  }

  async promoteLane(laneName: string, memoryId: string): Promise<unknown> {
    return this.fetchJson(
      `/lanes/${encodeURIComponent(laneName)}/${encodeURIComponent(memoryId)}`,
      { method: "POST", body: "{}" },
    );
  }

  async demoteLane(laneName: string, memoryId: string): Promise<unknown> {
    return this.fetchJson(
      `/lanes/${encodeURIComponent(laneName)}/${encodeURIComponent(memoryId)}`,
      { method: "DELETE" },
    );
  }

  private async fetchJson(path: string, init: FetchInit = {}): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: compactObject({
        "content-type": "application/json",
        ...(init.headers ?? {}),
      }),
    });

    if (!response.ok) {
      if (init.allowNotFound && response.status === 404) {
        return null;
      }

      const body = await response.text();
      throw new Error(`Smart Memory HTTP ${response.status} for ${path}: ${body}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  private normalizeMemory(payload: unknown): SmartMemoryMemory {
    const record = toRecord(payload);
    const entities = arrayify(record.entities, (item) => String(item));
    const sourceMessageIds = arrayify(record.source_message_ids, (item) => String(item));

    return {
      id: String(record.id ?? record.memory_id ?? ""),
      memory_type:
        typeof record.memory_type === "string"
          ? record.memory_type
          : typeof record.type === "string"
            ? record.type
            : undefined,
      type: typeof record.type === "string" ? record.type : undefined,
      status: typeof record.status === "string" ? record.status : undefined,
      content:
        typeof record.content === "string"
          ? record.content
          : JSON.stringify(record.content ?? record),
      importance_score:
        typeof record.importance_score === "number"
          ? record.importance_score
          : typeof record.importance === "number"
            ? record.importance
            : undefined,
      importance: typeof record.importance === "number" ? record.importance : undefined,
      confidence:
        typeof record.confidence === "number" ? record.confidence : undefined,
      source_session_id:
        typeof record.source_session_id === "string"
          ? record.source_session_id
          : undefined,
      source_message_ids: sourceMessageIds,
      entities,
      retrieval_tags: arrayify(record.retrieval_tags, (item) => String(item)),
      lane_eligibility: arrayify(record.lane_eligibility, (item) => String(item)),
      evidence_count:
        typeof record.evidence_count === "number"
          ? record.evidence_count
          : undefined,
      updated_at:
        typeof record.updated_at === "string"
          ? record.updated_at
          : typeof record.last_accessed_at === "string"
            ? record.last_accessed_at
            : undefined,
      created_at:
        typeof record.created_at === "string" ? record.created_at : undefined,
      raw: payload,
    };
  }

  private normalizeTranscriptMessage(payload: unknown): TranscriptMessage {
    const record = toRecord(payload);
    return {
      message_id: String(record.message_id ?? ""),
      session_id: String(record.session_id ?? ""),
      seq_num:
        typeof record.seq_num === "number" ? record.seq_num : 0,
      role: String(record.role ?? "unknown"),
      source_type: String(record.source_type ?? "unknown"),
      content: String(record.content ?? ""),
      created_at: String(record.created_at ?? new Date(0).toISOString()),
      tool_name:
        typeof record.tool_name === "string" || record.tool_name === null
          ? (record.tool_name as string | null)
          : undefined,
      parent_message_id:
        typeof record.parent_message_id === "string" ||
        record.parent_message_id === null
          ? (record.parent_message_id as string | null)
          : undefined,
      metadata: toRecord(record.metadata),
      raw: payload,
    };
  }

  private normalizeEvidence(payload: unknown): MemoryEvidence {
    const record = toRecord(payload);
    return {
      memory_id: String(record.memory_id ?? ""),
      message_id: String(record.message_id ?? ""),
      evidence_kind: String(record.evidence_kind ?? "direct"),
      confidence:
        typeof record.confidence === "number" || record.confidence === null
          ? (record.confidence as number | null)
          : undefined,
      span_start:
        typeof record.span_start === "number" || record.span_start === null
          ? (record.span_start as number | null)
          : undefined,
      span_end:
        typeof record.span_end === "number" || record.span_end === null
          ? (record.span_end as number | null)
          : undefined,
      message:
        record.message && typeof record.message === "object"
          ? this.normalizeTranscriptMessage(record.message)
          : undefined,
      raw: payload,
    };
  }

  private normalizeCandidate(payload: unknown): RetrievalCandidate {
    const record = toRecord(payload);
    return {
      memory: this.normalizeMemory(record.memory),
      vector_score:
        typeof record.vector_score === "number" ? record.vector_score : 0,
      lane_boost:
        typeof record.lane_boost === "number" ? record.lane_boost : undefined,
    };
  }

  private normalizeRankedCandidate(payload: unknown): RankedCandidate {
    const record = toRecord(payload);
    return {
      memory: this.normalizeMemory(record.memory),
      score: typeof record.score === "number" ? record.score : 0,
      vector_score:
        typeof record.vector_score === "number" ? record.vector_score : undefined,
    };
  }
}

export function collectKnownSessions(
  items: Array<
    SmartMemoryMemory | TranscriptMessage | MemoryEvidence | RankedCandidate | RetrievalCandidate
  >,
): string[] {
  const sessionIds: string[] = [];

  for (const item of items) {
    if ("session_id" in item && typeof item.session_id === "string") {
      sessionIds.push(item.session_id);
    }

    if ("source_session_id" in item && typeof item.source_session_id === "string") {
      sessionIds.push(item.source_session_id);
    }

    if ("memory" in item && item.memory.source_session_id) {
      sessionIds.push(item.memory.source_session_id);
    }

    if ("message" in item && item.message?.session_id) {
      sessionIds.push(item.message.session_id);
    }
  }

  return uniqueStrings(sessionIds);
}
