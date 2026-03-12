import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ControlStore } from "../src/controlStore.js";
import { WorkspacePipeline } from "../src/pipeline.js";
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

describe("WorkspacePipeline", () => {
  it("assembles a workspace bundle and persists known sessions", async () => {
    const app = await createMockSmartMemory();
    cleanups.push(() => app.close());
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const tempDir = mkdtempSync(join(tmpdir(), "orchestrator-"));
    cleanups.push(() => rmSync(tempDir, { recursive: true, force: true }));

    const controlStore = new ControlStore(join(tempDir, "control.sqlite"));
    cleanups.push(() => controlStore.close());

    const pipeline = new WorkspacePipeline({
      smartMemoryClient: new SmartMemoryClient(`http://127.0.0.1:${port}`),
      controlStore,
    });

    const bundle = await pipeline.assembleWorkspace({
      session_id: "session_task",
      user_message: "What is blocking the database migration?",
      runtime: "openclaw",
      conversation_history: "",
      subject_hints: ["database migration"],
      task_hints: [],
      metadata: {},
    });

    expect(bundle.buckets.active_state.length).toBeGreaterThan(0);
    expect(bundle.adapters.openclaw?.prompt_injection).toContain("[Smart Memory Companion]");
    expect(controlStore.listKnownSessions().some((item) => item.session_id === "session_task")).toBe(true);
    expect(controlStore.listRuns().length).toBe(1);
  });

  it("degrades cleanly when transcript and lane capabilities are missing", async () => {
    const app = await createMockSmartMemory({
      includeLanes: false,
      includeTranscripts: false,
    });
    cleanups.push(() => app.close());
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const tempDir = mkdtempSync(join(tmpdir(), "orchestrator-"));
    cleanups.push(() => rmSync(tempDir, { recursive: true, force: true }));

    const controlStore = new ControlStore(join(tempDir, "control.sqlite"));
    cleanups.push(() => controlStore.close());

    const pipeline = new WorkspacePipeline({
      smartMemoryClient: new SmartMemoryClient(`http://127.0.0.1:${port}`),
      controlStore,
    });

    const bundle = await pipeline.assembleWorkspace({
      user_message: "Summarize the migration blocker.",
      runtime: "generic",
      conversation_history: "",
      subject_hints: [],
      task_hints: [],
      metadata: {},
    });

    expect(bundle.capabilities.endpoints.lanes).toBe(false);
    expect(bundle.capabilities.endpoints.transcripts).toBe(false);
    expect(bundle.framing_policy.notes).toContain("lanes:disabled");
  });
});
