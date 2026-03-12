import { afterEach, describe, expect, it } from "vitest";

import { SmartMemoryClient } from "../src/smartMemoryClient.js";
import { createMockSmartMemory } from "./helpers/mockSmartMemory.js";

const apps: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  while (apps.length > 0) {
    const app = apps.pop();
    if (app) {
      await app.close();
    }
  }
});

describe("SmartMemoryClient", () => {
  it("probes v3.1 capabilities from openapi", async () => {
    const app = await createMockSmartMemory();
    apps.push(app);
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const client = new SmartMemoryClient(`http://127.0.0.1:${port}`);

    const capabilities = await client.probeCapabilities();

    expect(capabilities.healthy).toBe(true);
    expect(capabilities.openapi_available).toBe(true);
    expect(capabilities.endpoints.rebuild).toBe(true);
    expect(capabilities.endpoints.transcripts).toBe(true);
  });
});
