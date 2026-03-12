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

describe("ingest pipeline", () => {
  it("records known sessions from companion-managed ingest", async () => {
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

    const result = await pipeline.ingestMessage({
      session_id: "session_append",
      role: "user",
      source_type: "conversation",
      content: "Please remember the deployment blocker.",
      metadata: {},
      label: "Deployment",
    });

    expect(result.ok).toBe(true);
    expect(controlStore.listKnownSessions().some((item) => item.session_id === "session_append")).toBe(true);
  });
});
