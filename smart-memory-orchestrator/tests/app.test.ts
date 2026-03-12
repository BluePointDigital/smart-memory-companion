import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { OrchestratorConfig } from "../orchestrator.config.js";
import { buildApp } from "../src/app.js";
import config, { resolveConfig } from "../src/config.js";
import { ControlStore } from "../src/controlStore.js";
import { SmartMemoryClient } from "../src/smartMemoryClient.js";
import { createMockSmartMemory } from "./helpers/mockSmartMemory.js";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) {
      await cleanup();
    }
  }
});

function makeConfig(params: {
  smartMemoryPort: number;
  uiMode?: OrchestratorConfig["uiServing"]["mode"];
  distPath?: string;
  devServerUrl?: string;
}) {
  return resolveConfig({
    smartMemory: {
      startMode: "manual",
      projectRoot: config.smartMemory.projectRoot,
      command: config.smartMemory.command,
      host: "127.0.0.1",
      port: params.smartMemoryPort,
    },
    uiServing: {
      mode: params.uiMode ?? "external",
      distPath: params.distPath ?? config.uiServing.distPath,
      devServerUrl: params.devServerUrl ?? "http://127.0.0.1:5173",
    },
    hooks: config.hooks,
    runtimeAdapters: config.runtimeAdapters,
    readiness: config.readiness,
    workspace: config.workspace,
  });
}

describe("buildApp", () => {
  it("reports system status and readiness through /api/system/status", async () => {
    const smartMemory = await createMockSmartMemory();
    cleanups.push(() => smartMemory.close());
    const address = smartMemory.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const tempDir = mkdtempSync(join(tmpdir(), "orchestrator-app-"));
    cleanups.push(() => rmSync(tempDir, { recursive: true, force: true }));
    const controlStore = new ControlStore(join(tempDir, "control.sqlite"));

    const app = await buildApp({
      smartMemoryClient: new SmartMemoryClient(`http://127.0.0.1:${port}`),
      controlStore,
      appConfig: makeConfig({
        smartMemoryPort: port,
        uiMode: "external",
        devServerUrl: "http://127.0.0.1:5173",
      }),
    });
    cleanups.push(() => app.close());

    const response = await app.inject({
      method: "GET",
      url: "/api/system/status",
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.ready).toBe(true);
    expect(payload.smart_memory.healthy).toBe(true);
    expect(payload.ui_serving.mode).toBe("external");
  });

  it("keeps runtime/context behavior aligned with workspace assembly", async () => {
    const smartMemory = await createMockSmartMemory();
    cleanups.push(() => smartMemory.close());
    const address = smartMemory.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const tempDir = mkdtempSync(join(tmpdir(), "orchestrator-app-"));
    cleanups.push(() => rmSync(tempDir, { recursive: true, force: true }));
    const controlStore = new ControlStore(join(tempDir, "control.sqlite"));

    const app = await buildApp({
      smartMemoryClient: new SmartMemoryClient(`http://127.0.0.1:${port}`),
      controlStore,
      appConfig: makeConfig({
        smartMemoryPort: port,
      }),
    });
    cleanups.push(() => app.close());

    const body = {
      session_id: "session_task",
      user_message: "What is blocking the database migration?",
      runtime: "openclaw",
      conversation_history: "",
      subject_hints: ["database migration"],
      task_hints: [],
      metadata: {},
    };

    const workspaceResponse = await app.inject({
      method: "POST",
      url: "/api/workspace/assemble",
      payload: body,
    });
    const runtimeResponse = await app.inject({
      method: "POST",
      url: "/api/runtime/context",
      payload: body,
    });

    const workspacePayload = workspaceResponse.json();
    const runtimePayload = runtimeResponse.json();

    expect(runtimePayload.request.user_message).toBe(workspacePayload.request.user_message);
    expect(runtimePayload.framing_policy.task_mode).toBe(
      workspacePayload.framing_policy.task_mode,
    );
    expect(runtimePayload.buckets.active_state.length).toBe(
      workspacePayload.buckets.active_state.length,
    );
    expect(runtimePayload.adapters.openclaw.prompt_injection).toContain(
      "[Smart Memory Companion]",
    );
  });

  it("seeds known sessions from startup-visible artifacts", async () => {
    const smartMemory = await createMockSmartMemory();
    cleanups.push(() => smartMemory.close());
    const address = smartMemory.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const tempDir = mkdtempSync(join(tmpdir(), "orchestrator-app-"));
    cleanups.push(() => rmSync(tempDir, { recursive: true, force: true }));
    const controlStore = new ControlStore(join(tempDir, "control.sqlite"));

    const app = await buildApp({
      smartMemoryClient: new SmartMemoryClient(`http://127.0.0.1:${port}`),
      controlStore,
      appConfig: makeConfig({
        smartMemoryPort: port,
      }),
    });
    cleanups.push(() => app.close());

    const seeded = await app.workspacePipeline.seedKnownSessions();
    const sessions = controlStore.listKnownSessions();

    expect(seeded).toBeGreaterThan(0);
    expect(sessions.some((item) => item.session_id === "session_task")).toBe(true);
  });

  it("records explicit decision reasons in the retrieval trace", async () => {
    const smartMemory = await createMockSmartMemory();
    cleanups.push(() => smartMemory.close());
    const address = smartMemory.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const tempDir = mkdtempSync(join(tmpdir(), "orchestrator-app-"));
    cleanups.push(() => rmSync(tempDir, { recursive: true, force: true }));
    const controlStore = new ControlStore(join(tempDir, "control.sqlite"));

    const app = await buildApp({
      smartMemoryClient: new SmartMemoryClient(`http://127.0.0.1:${port}`),
      controlStore,
      appConfig: makeConfig({
        smartMemoryPort: port,
      }),
    });
    cleanups.push(() => app.close());

    const response = await app.inject({
      method: "POST",
      url: "/api/workspace/assemble",
      payload: {
        user_message: "Summarize the migration blocker.",
        runtime: "generic",
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.retrieval_trace.decisions.length).toBeGreaterThan(0);
    expect(payload.retrieval_trace.decisions[0].inclusion_source).toBeTruthy();
    expect(payload.retrieval_trace.decisions[0].policy_rule_applied).toBeTruthy();
  });

  it("serves the built UI from / without colliding with /api routes", async () => {
    const smartMemory = await createMockSmartMemory();
    cleanups.push(() => smartMemory.close());
    const address = smartMemory.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const tempDir = mkdtempSync(join(tmpdir(), "orchestrator-ui-"));
    const distDir = join(tempDir, "dist");
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(distDir, "index.html"), "<html><body>ui shell</body></html>", "utf8");
    cleanups.push(() => rmSync(tempDir, { recursive: true, force: true }));
    const controlStore = new ControlStore(join(tempDir, "control.sqlite"));

    const app = await buildApp({
      smartMemoryClient: new SmartMemoryClient(`http://127.0.0.1:${port}`),
      controlStore,
      appConfig: makeConfig({
        smartMemoryPort: port,
        uiMode: "static",
        distPath: distDir,
      }),
    });
    cleanups.push(() => app.close());

    const uiResponse = await app.inject({
      method: "GET",
      url: "/runs/run_example",
    });
    const apiResponse = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(uiResponse.statusCode).toBe(200);
    expect(uiResponse.body).toContain("ui shell");
    expect(apiResponse.statusCode).toBe(200);
    expect(apiResponse.body).toContain("\"service\":\"smart-memory-orchestrator\"");
  });
});
