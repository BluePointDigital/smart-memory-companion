import fs from "node:fs";

import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import { Type } from "@sinclair/typebox";
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  ActionResultSchema,
  HealthResponseSchema,
  IngestMessageRequest,
  IngestMessageRequestSchema,
  IngestResponseSchema,
  IngestTurnRequest,
  IngestTurnRequestSchema,
  KnownSessionsResponseSchema,
  MemoriesResponseSchema,
  MemoryEvidenceSchema,
  OrchestrationRequest,
  OrchestrationRequestSchema,
  RebuildActionResponseSchema,
  RunDetailSchema,
  RunsResponseSchema,
  SmartMemoryCapabilitiesSchema,
  SmartMemoryMemorySchema,
  SystemStatusSchema,
  TranscriptResponseSchema,
  WorkspaceBundleSchema,
} from "./contracts.js";
import config, { ResolvedOrchestratorConfig } from "./config.js";
import { ControlStore } from "./controlStore.js";
import { WorkspacePipeline } from "./pipeline.js";
import { buildMemorySummary } from "./rebuildSummary.js";
import { SmartMemoryClient } from "./smartMemoryClient.js";
import { SmartMemorySupervisor } from "./smartMemorySupervisor.js";

type BuildAppOptions = {
  smartMemoryClient?: SmartMemoryClient;
  controlStore?: ControlStore;
  supervisor?: SmartMemorySupervisor;
  appConfig?: ResolvedOrchestratorConfig;
};

const API_PREFIX = "/api";

function requestOrigin(request: FastifyRequest): string {
  return `${request.protocol}://${request.headers.host ?? "127.0.0.1:4100"}`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function handleSpaRequest(
  app: FastifyInstance,
  appConfig: ResolvedOrchestratorConfig,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const url = request.raw.url ?? "/";
  if (url.startsWith(API_PREFIX)) {
    return reply.callNotFound();
  }

  if (appConfig.uiServing.mode === "static" && fs.existsSync(appConfig.uiServing.distPath)) {
    return reply.sendFile("index.html");
  }

  if (appConfig.uiServing.mode === "external" && appConfig.uiServing.devServerUrl) {
    const redirect = new URL(url, appConfig.uiServing.devServerUrl).toString();
    return reply.redirect(redirect, 307);
  }

  return reply
    .status(503)
    .type("text/plain")
    .send("UI is unavailable. Build smart-memory-ui or start the Vite dev server.");
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const appConfig = options.appConfig ?? config;
  const app = Fastify({
    logger: false,
  });

  const smartMemoryClient =
    options.smartMemoryClient ?? new SmartMemoryClient(appConfig.smartMemory.baseUrl);
  const controlStore = options.controlStore ?? new ControlStore();
  const supervisor =
    options.supervisor ??
    new SmartMemorySupervisor({
      client: smartMemoryClient,
      config: appConfig,
    });
  const pipeline = new WorkspacePipeline({
    smartMemoryClient,
    controlStore,
    hooks: appConfig.hooks,
  });

  await supervisor.boot();

  app.decorate("smartMemoryClient", smartMemoryClient);
  app.decorate("controlStore", controlStore);
  app.decorate("workspacePipeline", pipeline);
  app.decorate("smartMemorySupervisor", supervisor);
  app.decorate("appConfig", appConfig);

  await app.register(cors, {
    origin: true,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Smart Memory Orchestrator API",
        version: "0.2.0",
      },
    },
  });

  if (appConfig.uiServing.mode === "static" && fs.existsSync(appConfig.uiServing.distPath)) {
    await app.register(fastifyStatic, {
      root: appConfig.uiServing.distPath,
      prefix: "/",
      wildcard: false,
    });
  } else if (appConfig.uiServing.mode === "static") {
    supervisor.noteStartupError(
      `Static UI bundle was not found at ${appConfig.uiServing.distPath}`,
    );
  } else if (
    appConfig.uiServing.mode === "external" &&
    !appConfig.uiServing.devServerUrl
  ) {
    supervisor.noteStartupError("uiServing.devServerUrl is required in external mode");
  }

  app.addHook("onReady", async () => {
    setTimeout(() => {
      pipeline.seedKnownSessions().catch((error) => {
        supervisor.noteStartupError(`Known-session backfill failed: ${toErrorMessage(error)}`);
      });
    }, 0);
  });

  app.addHook("onClose", async () => {
    controlStore.close();
    await supervisor.close();
  });

  app.setErrorHandler((error, _request, reply) => {
    const message = toErrorMessage(error);
    const statusCode = message.includes("unavailable") ? 503 : 500;
    reply.status(statusCode).send({
      message,
    });
  });

  const getCapabilities = async () => supervisor.refreshStatus();

  const healthHandler = async () => {
    const capabilities = await getCapabilities();
    return {
      status: capabilities.healthy ? "ok" : "degraded",
      service: "smart-memory-orchestrator",
      ready: capabilities.healthy,
    };
  };

  const capabilitiesHandler = async () => getCapabilities();

  const systemStatusHandler = async (request: FastifyRequest) => {
    await supervisor.refreshStatus();
    return supervisor.getStatus(requestOrigin(request));
  };

  const assembleWorkspaceHandler = async (request: FastifyRequest) =>
    pipeline.assembleWorkspace(request.body as OrchestrationRequest);

  const ingestTurnHandler = async (request: FastifyRequest) =>
    pipeline.ingestTurn(request.body as IngestTurnRequest);

  const ingestMessageHandler = async (request: FastifyRequest) =>
    pipeline.ingestMessage(request.body as IngestMessageRequest);

  app.get(
    `${API_PREFIX}/openapi.json`,
    {
      schema: {
        response: {
          200: Type.Any(),
        },
      },
    },
    async () => app.swagger(),
  );

  app.get(
    `${API_PREFIX}/health`,
    {
      schema: {
        response: {
          200: HealthResponseSchema,
        },
      },
    },
    healthHandler,
  );

  app.get(
    `${API_PREFIX}/capabilities`,
    {
      schema: {
        response: {
          200: SmartMemoryCapabilitiesSchema,
        },
      },
    },
    capabilitiesHandler,
  );

  app.get(
    `${API_PREFIX}/system/status`,
    {
      schema: {
        response: {
          200: SystemStatusSchema,
        },
      },
    },
    systemStatusHandler,
  );

  app.post(
    `${API_PREFIX}/workspace/assemble`,
    {
      schema: {
        body: OrchestrationRequestSchema,
        response: {
          200: WorkspaceBundleSchema,
        },
      },
    },
    assembleWorkspaceHandler,
  );

  app.post(
    `${API_PREFIX}/runtime/context`,
    {
      schema: {
        body: OrchestrationRequestSchema,
        response: {
          200: WorkspaceBundleSchema,
        },
      },
    },
    assembleWorkspaceHandler,
  );

  app.post(
    `${API_PREFIX}/ingest/turn`,
    {
      schema: {
        body: IngestTurnRequestSchema,
        response: {
          200: IngestResponseSchema,
        },
      },
    },
    ingestTurnHandler,
  );

  app.post(
    `${API_PREFIX}/runtime/ingest/turn`,
    {
      schema: {
        body: IngestTurnRequestSchema,
        response: {
          200: IngestResponseSchema,
        },
      },
    },
    ingestTurnHandler,
  );

  app.post(
    `${API_PREFIX}/ingest/message`,
    {
      schema: {
        body: IngestMessageRequestSchema,
        response: {
          200: IngestResponseSchema,
        },
      },
    },
    ingestMessageHandler,
  );

  app.post(
    `${API_PREFIX}/runtime/ingest/message`,
    {
      schema: {
        body: IngestMessageRequestSchema,
        response: {
          200: IngestResponseSchema,
        },
      },
    },
    ingestMessageHandler,
  );

  app.get(
    `${API_PREFIX}/runs`,
    {
      schema: {
        querystring: Type.Object({
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 200 })),
        }),
        response: {
          200: RunsResponseSchema,
        },
      },
    },
    async (request) => {
      const query = request.query as { limit?: number };
      return {
        items: controlStore.listRuns(query.limit ?? 50),
      };
    },
  );

  app.get(
    `${API_PREFIX}/runs/:runId`,
    {
      schema: {
        params: Type.Object({
          runId: Type.String(),
        }),
        response: {
          200: RunDetailSchema,
          404: RunDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { runId: string };
      const run = controlStore.getRun(params.runId);
      if (!run) {
        reply.code(404);
        return {
          summary: {
            run_id: params.runId,
            runtime: "unknown",
            user_message: "",
            status: "missing",
            created_at: new Date(0).toISOString(),
            updated_at: new Date(0).toISOString(),
          },
          capabilities: await getCapabilities(),
          stage_trace: [],
          hook_trace: [],
        };
      }

      return run;
    },
  );

  app.get(
    `${API_PREFIX}/runs/:runId/workspace`,
    {
      schema: {
        params: Type.Object({
          runId: Type.String(),
        }),
        response: {
          200: WorkspaceBundleSchema,
          404: Type.Object({
            message: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { runId: string };
      const workspace = controlStore.getWorkspace(params.runId);
      if (!workspace) {
        reply.code(404);
        throw new Error("workspace run not found");
      }
      return workspace;
    },
  );

  app.get(
    `${API_PREFIX}/transcripts/sessions`,
    {
      schema: {
        querystring: Type.Object({
          q: Type.Optional(Type.String()),
        }),
        response: {
          200: KnownSessionsResponseSchema,
        },
      },
    },
    async (request) => {
      const query = request.query as { q?: string };
      return {
        items: controlStore.listKnownSessions(query.q),
      };
    },
  );

  app.get(
    `${API_PREFIX}/transcripts/:sessionId`,
    {
      schema: {
        params: Type.Object({
          sessionId: Type.String(),
        }),
        response: {
          200: TranscriptResponseSchema,
        },
      },
    },
    async (request) => {
      const params = request.params as { sessionId: string };
      const messages = await smartMemoryClient.getTranscript(params.sessionId);
      controlStore.upsertKnownSession({
        sessionId: params.sessionId,
        source: "transcript_lookup",
      });
      return {
        session_id: params.sessionId,
        messages,
      };
    },
  );

  app.get(
    `${API_PREFIX}/memories`,
    {
      schema: {
        querystring: Type.Object({
          type: Type.Optional(Type.String()),
          status: Type.Optional(Type.String()),
          lane: Type.Optional(Type.String()),
          session_id: Type.Optional(Type.String()),
        }),
        response: {
          200: MemoriesResponseSchema,
        },
      },
    },
    async (request) => {
      const query = request.query as {
        type?: string;
        status?: string;
        lane?: string;
        session_id?: string;
      };
      const capabilities = await getCapabilities();
      let memories = await smartMemoryClient.listMemories(query.type);

      if (query.status) {
        memories = memories.filter(
          (memory) =>
            (memory.status ?? "unknown").toLowerCase() === query.status?.toLowerCase(),
        );
      }

      if (query.session_id) {
        memories = memories.filter(
          (memory) => memory.source_session_id === query.session_id,
        );
      }

      if (query.lane && capabilities.endpoints.lanes) {
        const laneIds = new Set(
          (await smartMemoryClient.getLane(query.lane)).map((memory) => memory.id),
        );
        memories = memories.filter((memory) => laneIds.has(memory.id));
      }

      for (const memory of memories) {
        if (memory.source_session_id) {
          controlStore.upsertKnownSession({
            sessionId: memory.source_session_id,
            source: "memory_lookup",
          });
        }
      }

      return { items: memories };
    },
  );

  app.get(
    `${API_PREFIX}/memories/:memoryId`,
    {
      schema: {
        params: Type.Object({
          memoryId: Type.String(),
        }),
        response: {
          200: SmartMemoryMemorySchema,
          404: Type.Object({
            message: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { memoryId: string };
      const memory = await smartMemoryClient.getMemory(params.memoryId);
      if (!memory) {
        reply.code(404);
        throw new Error("memory not found");
      }
      return memory;
    },
  );

  app.get(
    `${API_PREFIX}/memories/:memoryId/chain`,
    {
      schema: {
        params: Type.Object({
          memoryId: Type.String(),
        }),
        response: {
          200: MemoriesResponseSchema,
        },
      },
    },
    async (request) => {
      const params = request.params as { memoryId: string };
      return {
        items: await smartMemoryClient.getMemoryChain(params.memoryId),
      };
    },
  );

  app.get(
    `${API_PREFIX}/memories/:memoryId/history`,
    {
      schema: {
        params: Type.Object({
          memoryId: Type.String(),
        }),
        response: {
          200: MemoriesResponseSchema,
        },
      },
    },
    async (request) => {
      const params = request.params as { memoryId: string };
      return {
        items: await smartMemoryClient.getMemoryHistory(params.memoryId),
      };
    },
  );

  app.get(
    `${API_PREFIX}/memories/:memoryId/evidence`,
    {
      schema: {
        params: Type.Object({
          memoryId: Type.String(),
        }),
        response: {
          200: Type.Object({
            items: Type.Array(MemoryEvidenceSchema),
          }),
        },
      },
    },
    async (request) => {
      const params = request.params as { memoryId: string };
      return {
        items: await smartMemoryClient.getMemoryEvidence(params.memoryId),
      };
    },
  );

  app.post(
    `${API_PREFIX}/actions/rebuild`,
    {
      schema: {
        response: {
          200: RebuildActionResponseSchema,
        },
      },
    },
    async () => {
      const capabilities = await getCapabilities();
      const before = await buildMemorySummary(smartMemoryClient, capabilities);
      const report = await smartMemoryClient.rebuildAll();
      const after = await buildMemorySummary(smartMemoryClient, capabilities);

      return {
        ok: true,
        scope: "full",
        report,
        diff: {
          before,
          after,
        },
      };
    },
  );

  app.post(
    `${API_PREFIX}/actions/rebuild/:sessionId`,
    {
      schema: {
        params: Type.Object({
          sessionId: Type.String(),
        }),
        response: {
          200: RebuildActionResponseSchema,
        },
      },
    },
    async (request) => {
      const params = request.params as { sessionId: string };
      const capabilities = await getCapabilities();
      const before = await buildMemorySummary(smartMemoryClient, capabilities);
      const report = await smartMemoryClient.rebuildSession(params.sessionId);
      const after = await buildMemorySummary(smartMemoryClient, capabilities);

      controlStore.upsertKnownSession({
        sessionId: params.sessionId,
        source: "rebuild_session",
      });

      return {
        ok: true,
        scope: "session",
        report,
        diff: {
          before,
          after,
        },
      };
    },
  );

  app.post(
    `${API_PREFIX}/actions/lanes/:laneName/:memoryId`,
    {
      schema: {
        params: Type.Object({
          laneName: Type.String(),
          memoryId: Type.String(),
        }),
        response: {
          200: ActionResultSchema,
        },
      },
    },
    async (request) => {
      const params = request.params as { laneName: string; memoryId: string };
      const detail = await smartMemoryClient.promoteLane(
        params.laneName,
        params.memoryId,
      );
      return {
        ok: true,
        action: "lane_promote",
        detail: detail as Record<string, unknown>,
      };
    },
  );

  app.delete(
    `${API_PREFIX}/actions/lanes/:laneName/:memoryId`,
    {
      schema: {
        params: Type.Object({
          laneName: Type.String(),
          memoryId: Type.String(),
        }),
        response: {
          200: ActionResultSchema,
        },
      },
    },
    async (request) => {
      const params = request.params as { laneName: string; memoryId: string };
      const detail = await smartMemoryClient.demoteLane(
        params.laneName,
        params.memoryId,
      );
      return {
        ok: true,
        action: "lane_demote",
        detail: detail as Record<string, unknown>,
      };
    },
  );

  app.get("/openapi.json", async () => app.swagger());
  app.get("/health", healthHandler);
  app.get("/capabilities", capabilitiesHandler);
  app.post("/workspace/assemble", assembleWorkspaceHandler);
  app.post("/ingest/turn", ingestTurnHandler);
  app.post("/ingest/message", ingestMessageHandler);
  app.post("/actions/rebuild", async () =>
    app.inject({
      method: "POST",
      url: `${API_PREFIX}/actions/rebuild`,
    }).then((response) => JSON.parse(response.body)),
  );
  app.post("/actions/rebuild/:sessionId", async (request) =>
    app
      .inject({
        method: "POST",
        url: `${API_PREFIX}/actions/rebuild/${encodeURIComponent(
          (request.params as { sessionId: string }).sessionId,
        )}`,
      })
      .then((response) => JSON.parse(response.body)),
  );
  app.post("/actions/lanes/:laneName/:memoryId", async (request) =>
    app
      .inject({
        method: "POST",
        url: `${API_PREFIX}/actions/lanes/${encodeURIComponent(
          (request.params as { laneName: string }).laneName,
        )}/${encodeURIComponent((request.params as { memoryId: string }).memoryId)}`,
      })
      .then((response) => JSON.parse(response.body)),
  );
  app.delete("/actions/lanes/:laneName/:memoryId", async (request) =>
    app
      .inject({
        method: "DELETE",
        url: `${API_PREFIX}/actions/lanes/${encodeURIComponent(
          (request.params as { laneName: string }).laneName,
        )}/${encodeURIComponent((request.params as { memoryId: string }).memoryId)}`,
      })
      .then((response) => JSON.parse(response.body)),
  );

  app.get("/*", (request, reply) => handleSpaRequest(app, appConfig, request, reply));

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    smartMemoryClient: SmartMemoryClient;
    controlStore: ControlStore;
    workspacePipeline: WorkspacePipeline;
    smartMemorySupervisor: SmartMemorySupervisor;
    appConfig: ResolvedOrchestratorConfig;
  }
}
