import test from "node:test";
import assert from "node:assert/strict";

import { ensureServiceRunning, shutdownManagedChildren } from "../lib/launcher-core.mjs";

test("detect mode reuses an existing service without spawning", async () => {
  let starts = 0;

  const result = await ensureServiceRunning({
    mode: "detect",
    probeReady: async () => true,
    startProcess: async () => {
      starts += 1;
      return { pid: 123 };
    },
    waitForReady: async () => {},
  });

  assert.equal(result.state, "reused");
  assert.equal(starts, 0);
});

test("autostart mode starts the service when it is offline", async () => {
  let starts = 0;
  let ready = false;

  const result = await ensureServiceRunning({
    mode: "autostart",
    probeReady: async () => ready,
    startProcess: async () => {
      starts += 1;
      ready = true;
      return { pid: 456 };
    },
    waitForReady: async () => {
      assert.equal(ready, true);
    },
  });

  assert.equal(result.state, "started");
  assert.equal(starts, 1);
});

test("autostart mode surfaces readiness timeouts and terminates the child", async () => {
  let terminated = 0;

  await assert.rejects(
    ensureServiceRunning({
      mode: "autostart",
      probeReady: async () => false,
      startProcess: async () => ({ pid: 789 }),
      waitForReady: async () => {
        throw new Error("timeout");
      },
      terminateProcess: () => {
        terminated += 1;
      },
    }),
    /timeout/,
  );

  assert.equal(terminated, 1);
});

test("shutdown terminates managed children in reverse order", async () => {
  const terminated = [];
  const children = [{ pid: 1 }, { pid: 2 }, { pid: 3 }];

  await shutdownManagedChildren(children, (child) => {
    terminated.push(child.pid);
  });

  assert.deepEqual(terminated, [3, 2, 1]);
});
