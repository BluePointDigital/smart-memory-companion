import Fastify, { FastifyInstance } from "fastify";

import { loadFixture } from "./fixture.js";

export async function createMockSmartMemory(options?: {
  includeLanes?: boolean;
  includeTranscripts?: boolean;
}): Promise<FastifyInstance> {
  const includeLanes = options?.includeLanes ?? true;
  const includeTranscripts = options?.includeTranscripts ?? true;
  const app = Fastify();

  const health = loadFixture<Record<string, unknown>>("health.json");
  const memories = loadFixture<Array<Record<string, unknown>>>("memories.json");
  const retrieve = loadFixture<Record<string, unknown>>("retrieve.json");
  const transcript = loadFixture<Array<Record<string, unknown>>>("transcript.json");
  const evidence = loadFixture<Array<Record<string, unknown>>>("evidence.json");
  const history = loadFixture<Array<Record<string, unknown>>>("history.json");
  const chain = loadFixture<Array<Record<string, unknown>>>("chain.json");
  const rebuild = loadFixture<Record<string, unknown>>("rebuild.json");
  const openapi = loadFixture<Record<string, unknown>>("openapi.json");

  if (!includeLanes) {
    delete (openapi.paths as Record<string, unknown>)["/lanes/{lane_name}"];
  }

  if (!includeTranscripts) {
    delete (openapi.paths as Record<string, unknown>)["/transcripts/{session_id}"];
    delete (openapi.paths as Record<string, unknown>)["/transcript/message/{message_id}"];
  }

  app.get("/health", async () => health);
  app.get("/openapi.json", async () => openapi);
  app.get("/memories", async () => memories);
  app.get("/memory/:memoryId", async (_request, reply) => {
    const memory = memories[0];
    if (!memory) {
      reply.code(404);
      return { detail: "not found" };
    }
    return memory;
  });
  app.get("/memory/:memoryId/history", async () => history);
  app.get("/memory/:memoryId/chain", async () => chain);
  app.get("/memory/:memoryId/evidence", async () => evidence);
  app.post("/retrieve", async () => retrieve);

  if (includeTranscripts) {
    app.get("/transcripts/:sessionId", async () => transcript);
    app.get("/transcript/message/:messageId", async () => transcript[0]);
  }

  if (includeLanes) {
    app.get("/lanes/:laneName", async (request) => {
      const laneName = (request.params as { laneName: string }).laneName;
      if (laneName === "core") {
        return [memories[0]];
      }
      if (laneName === "working") {
        return [memories[1]];
      }
      return [];
    });

    app.post("/lanes/:laneName/:memoryId", async (request) => ({
      ok: true,
      lane: (request.params as { laneName: string }).laneName,
      memory_id: (request.params as { memoryId: string }).memoryId,
    }));

    app.delete("/lanes/:laneName/:memoryId", async (request) => ({
      ok: true,
      lane: (request.params as { laneName: string }).laneName,
      memory_id: (request.params as { memoryId: string }).memoryId,
    }));
  }

  app.post("/rebuild", async () => rebuild);
  app.post("/rebuild/:sessionId", async () => rebuild);
  app.post("/ingest", async (request) => ({
    ok: true,
    source_session_id: (request.body as { source_session_id?: string }).source_session_id ?? "session_ingest",
  }));
  app.post("/transcripts/message", async (request) => ({
    ok: true,
    session_id: (request.body as { session_id?: string }).session_id ?? "session_append",
  }));

  await app.listen({ port: 0, host: "127.0.0.1" });
  return app;
}
