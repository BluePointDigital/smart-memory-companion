import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiDelete, apiGet, apiPost } from "./client";
import type {
  CapabilitiesResponse,
  HealthResponse,
  KnownSessionsResponse,
  MemoriesResponse,
  MemoryEvidence,
  MemoryRecord,
  RebuildResponse,
  RunDetail,
  RunsResponse,
  SystemStatus,
  TranscriptResponse,
  WorkspaceBundle,
} from "./types";

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: async () => apiGet<HealthResponse>("/api/health"),
    refetchInterval: 15000,
  });
}

export function useCapabilities() {
  return useQuery({
    queryKey: ["capabilities"],
    queryFn: async () => apiGet<CapabilitiesResponse>("/api/capabilities"),
    refetchInterval: 15000,
  });
}

export function useSystemStatus() {
  return useQuery({
    queryKey: ["system-status"],
    queryFn: async () => apiGet<SystemStatus>("/api/system/status"),
    refetchInterval: 10000,
  });
}

export function useRuns() {
  return useQuery({
    queryKey: ["runs"],
    queryFn: async () => apiGet<RunsResponse>("/api/runs"),
  });
}

export function useRun(runId?: string) {
  return useQuery({
    queryKey: ["run", runId],
    enabled: Boolean(runId),
    queryFn: async () =>
      apiGet<RunDetail>("/api/runs/{runId}", {
        params: {
          path: {
            runId: runId!,
          },
        },
      }),
  });
}

export function useSessions(search?: string) {
  return useQuery({
    queryKey: ["sessions", search ?? ""],
    queryFn: async () =>
      apiGet<KnownSessionsResponse>("/api/transcripts/sessions", {
        params: {
          query: search ? { q: search } : undefined,
        },
      }),
  });
}

export function useTranscript(sessionId?: string) {
  return useQuery({
    queryKey: ["transcript", sessionId],
    enabled: Boolean(sessionId),
    queryFn: async () =>
      apiGet<TranscriptResponse>("/api/transcripts/{sessionId}", {
        params: {
          path: {
            sessionId: sessionId!,
          },
        },
      }),
  });
}

export function useMemories(filters?: {
  type?: string;
  status?: string;
  lane?: string;
  sessionId?: string;
}) {
  return useQuery({
    queryKey: ["memories", filters ?? {}],
    queryFn: async () =>
      apiGet<MemoriesResponse>("/api/memories", {
        params: {
          query: {
            type: filters?.type,
            status: filters?.status,
            lane: filters?.lane,
            session_id: filters?.sessionId,
          },
        },
      }),
  });
}

export function useMemory(memoryId?: string) {
  return useQuery({
    queryKey: ["memory", memoryId],
    enabled: Boolean(memoryId),
    queryFn: async () =>
      apiGet<MemoryRecord>("/api/memories/{memoryId}", {
        params: {
          path: {
            memoryId: memoryId!,
          },
        },
      }),
  });
}

export function useMemoryChain(memoryId?: string) {
  return useQuery({
    queryKey: ["memory-chain", memoryId],
    enabled: Boolean(memoryId),
    queryFn: async () =>
      apiGet<MemoriesResponse>("/api/memories/{memoryId}/chain", {
        params: {
          path: {
            memoryId: memoryId!,
          },
        },
      }),
  });
}

export function useMemoryHistory(memoryId?: string) {
  return useQuery({
    queryKey: ["memory-history", memoryId],
    enabled: Boolean(memoryId),
    queryFn: async () =>
      apiGet<MemoriesResponse>("/api/memories/{memoryId}/history", {
        params: {
          path: {
            memoryId: memoryId!,
          },
        },
      }),
  });
}

export function useMemoryEvidence(memoryId?: string) {
  return useQuery({
    queryKey: ["memory-evidence", memoryId],
    enabled: Boolean(memoryId),
    queryFn: async () =>
      apiGet<{ items: MemoryEvidence[] }>("/api/memories/{memoryId}/evidence", {
        params: {
          path: {
            memoryId: memoryId!,
          },
        },
      }),
  });
}

export function useSessionEvidence(sessionId?: string) {
  return useQuery({
    queryKey: ["session-evidence", sessionId],
    enabled: Boolean(sessionId),
    queryFn: async () => {
      const memories = await apiGet<MemoriesResponse>("/api/memories", {
        params: {
          query: {
            session_id: sessionId!,
          },
        },
      });

      const evidencePairs = await Promise.all(
        memories.items.map(async (memory) => {
          const evidence = await apiGet<{ items: MemoryEvidence[] }>(
            "/api/memories/{memoryId}/evidence",
            {
              params: {
                path: {
                  memoryId: memory.id,
                },
              },
            },
          );

          return {
            memory,
            evidence: evidence.items,
          };
        }),
      );

      return evidencePairs.reduce<
        Record<string, Array<{ memory: MemoryRecord; evidence: MemoryEvidence }>>
      >((accumulator, pair) => {
        for (const item of pair.evidence) {
          accumulator[item.message_id] = [
            ...(accumulator[item.message_id] ?? []),
            {
              memory: pair.memory,
              evidence: item,
            },
          ];
        }
        return accumulator;
      }, {});
    },
  });
}

export function useAssembleWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      session_id?: string;
      user_message: string;
      runtime: string;
      conversation_history?: string;
      subject_hints?: string[];
      task_hints?: string[];
      transcript_window?: number;
      metadata?: Record<string, unknown>;
    }) =>
      apiPost<WorkspaceBundle>("/api/runtime/context", {
        body: payload,
      }),
    onSuccess: async (workspace) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["runs"] }),
        queryClient.setQueryData(["run", workspace.run_id], {
          summary: {
            run_id: workspace.run_id,
            runtime: workspace.request.runtime,
            user_message: workspace.request.user_message,
            status: "completed",
            created_at: workspace.created_at,
            updated_at: workspace.created_at,
            session_id: workspace.request.session_id,
          },
          capabilities: workspace.capabilities,
          framing_policy: workspace.framing_policy,
          retrieval_trace: workspace.retrieval_trace,
          transcript: workspace.transcript,
          workspace,
          stage_trace: workspace.stage_trace,
          hook_trace: workspace.hook_trace,
        }),
      ]);
    },
  });
}

export function useRebuildAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => apiPost<RebuildResponse>("/api/actions/rebuild"),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["runs"] }),
        queryClient.invalidateQueries({ queryKey: ["memories"] }),
      ]);
    },
  });
}

export function useRebuildSession(sessionId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiPost<RebuildResponse>("/api/actions/rebuild/{sessionId}", {
        params: {
          path: {
            sessionId: sessionId!,
          },
        },
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["runs"] }),
        queryClient.invalidateQueries({ queryKey: ["transcript", sessionId] }),
        queryClient.invalidateQueries({ queryKey: ["memories"] }),
      ]);
    },
  });
}

export function usePromoteLane(memoryId?: string, laneName = "core") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiPost<{ ok: boolean; action: string; detail: Record<string, unknown> }>(
        "/api/actions/lanes/{laneName}/{memoryId}",
        {
          params: {
            path: {
              laneName,
              memoryId: memoryId!,
            },
          },
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
  });
}

export function useDemoteLane(memoryId?: string, laneName = "core") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiDelete<{ ok: boolean; action: string; detail: Record<string, unknown> }>(
        "/api/actions/lanes/{laneName}/{memoryId}",
        {
          params: {
            path: {
              laneName,
              memoryId: memoryId!,
            },
          },
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
  });
}
