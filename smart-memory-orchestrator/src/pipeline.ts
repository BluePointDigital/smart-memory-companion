import {
  BucketCollection,
  FramingPolicy,
  HookTrace,
  IngestMessageRequest,
  IngestResponse,
  IngestTurnRequest,
  OrchestrationRequest,
  RetrievalResult,
  RetrievalTrace,
  StageTrace,
  TranscriptSlice,
  WorkspaceBundle,
} from "./contracts.js";
import config from "./config.js";
import { ControlStore } from "./controlStore.js";
import { deriveFramingPolicy } from "./framingPolicy.js";
import { executeHooks, HookContext, OrchestratorHook } from "./hooks.js";
import { groupRetrievedMemories } from "./retrievalGrouping.js";
import { collectKnownSessions, SmartMemoryClient } from "./smartMemoryClient.js";
import { assembleWorkspaceBundle } from "./workspaceAssembler.js";
import { durationMs, nowIso, randomId } from "./utils.js";

type PipelineDependencies = {
  smartMemoryClient: SmartMemoryClient;
  controlStore: ControlStore;
  hooks?: OrchestratorHook[];
};

export class WorkspacePipeline {
  private readonly smartMemoryClient: SmartMemoryClient;
  private readonly controlStore: ControlStore;
  private readonly hooks: OrchestratorHook[];

  constructor(dependencies: PipelineDependencies) {
    this.smartMemoryClient = dependencies.smartMemoryClient;
    this.controlStore = dependencies.controlStore;
    this.hooks = dependencies.hooks ?? config.hooks;
  }

  async assembleWorkspace(input: OrchestrationRequest): Promise<WorkspaceBundle> {
    const request: OrchestrationRequest = {
      conversation_history: "",
      subject_hints: [],
      task_hints: [],
      metadata: {},
      ...input,
      runtime: input.runtime ?? "generic",
    };

    const runId = randomId("run");
    const capabilities = await this.smartMemoryClient.probeCapabilities();

    if (!capabilities.healthy) {
      throw new Error("Smart Memory is unavailable");
    }

    this.controlStore.createRun({
      runId,
      sessionId: request.session_id,
      runtime: request.runtime,
      userMessage: request.user_message,
      request,
      capabilities,
    });

    const stageTrace: StageTrace[] = [];
    const hookTrace: HookTrace[] = [];

    const recordStageTrace = (trace: StageTrace) => {
      stageTrace.push(trace);
      this.controlStore.insertStageTrace(runId, trace);
    };

    const recordHookTrace = (trace: HookTrace) => {
      hookTrace.push(trace);
      this.controlStore.insertHookTrace(runId, trace);
    };

    let policy: FramingPolicy = deriveFramingPolicy(request, capabilities);
    let retrievalResult: RetrievalResult = {
      user_message: request.user_message,
      entities: [],
      candidates: [],
      selected: [],
      degraded: true,
      error: "retrieval not executed",
      raw: null,
    };
    let transcript: TranscriptSlice = {
      session_id: request.session_id,
      messages: [],
    };
    let buckets: BucketCollection = {
      active_state: [],
      supporting_constraints: [],
      references: [],
      suppressed: [],
    };
    let retrievalDecisions: RetrievalTrace["decisions"] = [];
    let bundle: WorkspaceBundle | undefined;
    const laneSnapshots = {
      core: [] as BucketCollection["active_state"],
      working: [] as BucketCollection["active_state"],
    };

    const baseHookContext: HookContext = {
      request,
      policy,
      transcriptMessages: transcript.messages,
      retrievalResult,
      buckets,
      bundle,
      stage: "before_retrieval",
    };

    await this.executeStage(
      "before_retrieval",
      async () => {
        policy = deriveFramingPolicy(request, capabilities);
        policy.transcript_window ||= config.workspace.transcriptWindowDefault;
        baseHookContext.stage = "before_retrieval";
        baseHookContext.policy = policy;
        await executeHooks({
          stage: "before_retrieval",
          hooks: this.hooks,
          context: baseHookContext,
          onTrace: recordHookTrace,
        });
        return {
          entity_scope: policy.entity_scope,
          include_history: policy.include_history,
          task_mode: policy.task_mode,
        };
      },
      recordStageTrace,
    );

    await this.executeStage(
      "fetch_inputs",
      async () => {
        if (capabilities.endpoints.lanes) {
          laneSnapshots.core = await this.smartMemoryClient.getLane("core");
          laneSnapshots.working = await this.smartMemoryClient.getLane("working");
        } else {
          policy.notes.push("lanes:disabled");
        }

        if (capabilities.endpoints.retrieve) {
          retrievalResult = await this.smartMemoryClient.retrieve({
            userMessage: request.user_message,
            conversationHistory: request.conversation_history,
            includeHistory: policy.include_history,
            entityScope: policy.entity_scope,
          });
        } else {
          policy.notes.push("retrieve:disabled");
        }

        if (request.session_id && capabilities.endpoints.transcripts) {
          const messages = await this.smartMemoryClient.getTranscript(request.session_id);
          transcript = {
            session_id: request.session_id,
            messages: messages.slice(-policy.transcript_window),
          };
        }

        const knownSessions = collectKnownSessions([
          ...laneSnapshots.core,
          ...laneSnapshots.working,
          ...retrievalResult.candidates,
          ...retrievalResult.selected,
          ...transcript.messages,
        ]);

        if (request.session_id) {
          knownSessions.push(request.session_id);
        }

        for (const sessionId of [...new Set(knownSessions)]) {
          this.controlStore.upsertKnownSession({
            sessionId,
            source: "workspace_fetch",
            metadata: {
              runtime: request.runtime,
            },
          });
        }

        return {
          core_count: laneSnapshots.core.length,
          working_count: laneSnapshots.working.length,
          candidate_count: retrievalResult.candidates.length,
          selected_count: retrievalResult.selected.length,
          transcript_count: transcript.messages.length,
        };
      },
      recordStageTrace,
    );

    await this.executeStage(
      "after_retrieval",
      async () => {
        const grouped = groupRetrievedMemories({
          core: laneSnapshots.core,
          working: laneSnapshots.working,
          selected: retrievalResult.selected,
          candidates: retrievalResult.candidates,
        });
        buckets = grouped.buckets;
        retrievalDecisions = grouped.decisions;

        baseHookContext.stage = "after_retrieval";
        baseHookContext.buckets = buckets;
        baseHookContext.retrievalResult = retrievalResult;
        baseHookContext.transcriptMessages = transcript.messages;
        await executeHooks({
          stage: "after_retrieval",
          hooks: this.hooks,
          context: baseHookContext,
          onTrace: recordHookTrace,
        });

        return {
          active_state: buckets.active_state.length,
          supporting_constraints: buckets.supporting_constraints.length,
          references: buckets.references.length,
          suppressed: buckets.suppressed.length,
        };
      },
      recordStageTrace,
    );

    const retrievalTrace: RetrievalTrace = {
      query: request.user_message,
      entities: retrievalResult.entities,
      candidate_count: retrievalResult.candidates.length,
      selected_count: retrievalResult.selected.length,
      notes: [
        ...policy.notes,
        retrievalResult.degraded ? "retrieval:degraded" : "retrieval:ok",
      ],
      candidates: retrievalResult.candidates,
      selected: retrievalResult.selected,
      decisions: retrievalDecisions,
    };

    try {
      await this.executeStage(
        "before_output",
        async () => {
          bundle = assembleWorkspaceBundle({
            runId,
            request,
            capabilities,
            policy,
            laneSnapshots,
            transcript,
            retrievalTrace,
            buckets,
            stageTrace,
            hookTrace,
          });

          baseHookContext.stage = "before_output";
          baseHookContext.bundle = bundle;
          await executeHooks({
            stage: "before_output",
            hooks: this.hooks,
            context: baseHookContext,
            onTrace: recordHookTrace,
          });

          return {
            adapters: Object.keys(bundle.adapters),
            active_state: bundle.buckets.active_state.length,
          };
        },
        recordStageTrace,
      );
    } catch (error) {
      this.controlStore.failRun(runId, {
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    if (!bundle) {
      const error = new Error("workspace bundle assembly failed");
      this.controlStore.failRun(runId, { message: error.message });
      throw error;
    }

    this.controlStore.completeRun({
      runId,
      status: "completed",
      capabilities,
      framingPolicy: policy,
      retrievalTrace,
      transcript,
      bundle,
    });

    return bundle;
  }

  async ingestTurn(payload: IngestTurnRequest): Promise<IngestResponse> {
    const operationId = randomId("ingest");
    const stageTrace: StageTrace[] = [];
    const hookTrace: HookTrace[] = [];
    const context: HookContext = { stage: "before_ingest" };

    await this.executeStage(
      "before_ingest",
      async () => {
        await executeHooks({
          stage: "before_ingest",
          hooks: this.hooks,
          context,
          onTrace: (trace) => hookTrace.push(trace),
        });
        return {
          source_session_id: payload.source_session_id ?? null,
        };
      },
      (trace) => stageTrace.push(trace),
    );

    const result = await this.smartMemoryClient.ingestTurn(payload as Record<string, unknown>);
    const sessionId =
      payload.source_session_id ||
      this.extractSessionId(result) ||
      undefined;

    if (sessionId) {
      this.controlStore.upsertKnownSession({
        sessionId,
        source: "ingest_turn",
      });
    }

    await this.executeStage(
      "after_ingest",
      async () => {
        await executeHooks({
          stage: "after_ingest",
          hooks: this.hooks,
          context: {
            stage: "after_ingest",
          },
          onTrace: (trace) => hookTrace.push(trace),
        });
        return {
          stored_session_id: sessionId ?? null,
        };
      },
      (trace) => stageTrace.push(trace),
    );

    return {
      ok: true,
      operation_id: operationId,
      session_id: sessionId,
      source: "turn_ingest",
      result,
      stage_trace: stageTrace,
      hook_trace: hookTrace,
    };
  }

  async ingestMessage(payload: IngestMessageRequest): Promise<IngestResponse> {
    const operationId = randomId("append");
    const stageTrace: StageTrace[] = [];
    const hookTrace: HookTrace[] = [];

    await this.executeStage(
      "before_ingest",
      async () => {
        await executeHooks({
          stage: "before_ingest",
          hooks: this.hooks,
          context: { stage: "before_ingest" },
          onTrace: (trace) => hookTrace.push(trace),
        });
        return {
          session_id: payload.session_id ?? null,
        };
      },
      (trace) => stageTrace.push(trace),
    );

    const result = await this.smartMemoryClient.appendTranscriptMessage(
      payload as Record<string, unknown>,
    );
    const sessionId = payload.session_id || this.extractSessionId(result) || undefined;

    if (sessionId) {
      this.controlStore.upsertKnownSession({
        sessionId,
        source: "append_message",
        label: payload.label,
        metadata: payload.metadata,
      });
    }

    await this.executeStage(
      "after_ingest",
      async () => {
        await executeHooks({
          stage: "after_ingest",
          hooks: this.hooks,
          context: { stage: "after_ingest" },
          onTrace: (trace) => hookTrace.push(trace),
        });
        return {
          stored_session_id: sessionId ?? null,
        };
      },
      (trace) => stageTrace.push(trace),
    );

    return {
      ok: true,
      operation_id: operationId,
      session_id: sessionId,
      source: "transcript_append",
      result,
      stage_trace: stageTrace,
      hook_trace: hookTrace,
    };
  }

  async seedKnownSessions(): Promise<number> {
    const capabilities = await this.smartMemoryClient.probeCapabilities();
    if (!capabilities.healthy) {
      return 0;
    }

    const sessionIds = new Set<string>(this.controlStore.listWorkspaceSessionIds());

    const memories = capabilities.endpoints.memories
      ? await this.smartMemoryClient.listMemories()
      : [];
    for (const sessionId of collectKnownSessions(memories)) {
      sessionIds.add(sessionId);
    }

    if (capabilities.endpoints.lanes) {
      const [core, working] = await Promise.all([
        this.smartMemoryClient.getLane("core"),
        this.smartMemoryClient.getLane("working"),
      ]);
      for (const sessionId of collectKnownSessions([...core, ...working])) {
        sessionIds.add(sessionId);
      }
    }

    for (const sessionId of sessionIds) {
      this.controlStore.upsertKnownSession({
        sessionId,
        source: "startup_backfill",
      });
    }

    return sessionIds.size;
  }

  private async executeStage<T>(
    stage: string,
    execute: () => Promise<T>,
    onTrace: (trace: StageTrace) => void,
  ): Promise<T> {
    const started = Date.now();
    const startedAt = nowIso();
    try {
      const payload = await execute();
      onTrace({
        stage,
        status: "completed",
        started_at: startedAt,
        finished_at: nowIso(),
        duration_ms: durationMs(started, Date.now()),
        payload: payload as Record<string, unknown>,
      });
      return payload;
    } catch (error) {
      onTrace({
        stage,
        status: "failed",
        started_at: startedAt,
        finished_at: nowIso(),
        duration_ms: durationMs(started, Date.now()),
        payload: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  private extractSessionId(result: unknown): string | null {
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      return null;
    }

    const record = result as Record<string, unknown>;
    const candidates = [
      record.session_id,
      record.source_session_id,
      record.sessionId,
      record.sourceSessionId,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }
    }

    return null;
  }
}
