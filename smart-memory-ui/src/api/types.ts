import type { paths } from "./generated/orchestrator";

type JsonResponse<
  Path extends keyof paths,
  Method extends keyof paths[Path],
  Status extends number,
> = paths[Path][Method] extends {
  responses: Record<Status, { content: { "application/json": infer Content } }>;
}
  ? Content
  : never;

export type HealthResponse = JsonResponse<"/api/health", "get", 200>;
export type SystemStatus = JsonResponse<"/api/system/status", "get", 200>;
export type CapabilitiesResponse = JsonResponse<"/api/capabilities", "get", 200>;
export type RunsResponse = JsonResponse<"/api/runs", "get", 200>;
export type RunSummary = RunsResponse["items"][number];
export type RunDetail = JsonResponse<"/api/runs/{runId}", "get", 200>;
export type WorkspaceBundle = JsonResponse<"/api/workspace/assemble", "post", 200>;
export type RuntimeWorkspaceBundle = JsonResponse<"/api/runtime/context", "post", 200>;
export type KnownSessionsResponse = JsonResponse<"/api/transcripts/sessions", "get", 200>;
export type KnownSession = KnownSessionsResponse["items"][number];
export type TranscriptResponse = JsonResponse<"/api/transcripts/{sessionId}", "get", 200>;
export type TranscriptMessage = TranscriptResponse["messages"][number];
export type MemoriesResponse = JsonResponse<"/api/memories", "get", 200>;
export type MemoryRecord = MemoriesResponse["items"][number];
export type MemoryEvidenceResponse = JsonResponse<
  "/api/memories/{memoryId}/evidence",
  "get",
  200
>;
export type MemoryEvidence = MemoryEvidenceResponse["items"][number];
export type ChainResponse = JsonResponse<"/api/memories/{memoryId}/chain", "get", 200>;
export type HistoryResponse = JsonResponse<"/api/memories/{memoryId}/history", "get", 200>;
export type ActionResult = JsonResponse<
  "/api/actions/lanes/{laneName}/{memoryId}",
  "post",
  200
>;
export type RebuildResponse = JsonResponse<"/api/actions/rebuild", "post", 200>;
