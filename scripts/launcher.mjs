import process from "node:process";

import { ensureServiceRunning, shutdownManagedChildren } from "./lib/launcher-core.mjs";
import {
  DEFAULT_ORCHESTRATOR_HOST,
  DEFAULT_ORCHESTRATOR_PORT,
  DEFAULT_SMART_MEMORY_HOST,
  DEFAULT_SMART_MEMORY_PORT,
  DEFAULT_UI_PORT,
  ORCHESTRATOR_DIR,
  SMART_MEMORY_DIR,
  UI_DIR,
  fileExists,
  npmCommand,
  resolveOrchestratorBaseUrl,
  resolveSmartMemoryBaseUrl,
  resolveSmartMemoryLaunch,
  resolveUiDevUrl,
  runCommand,
  spawnManagedProcess,
  terminateChild,
  waitForHttp,
} from "./lib/shared.mjs";

const mode = process.argv[2] === "app" ? "app" : "dev";
const children = [];
const smartMemoryBaseUrl = resolveSmartMemoryBaseUrl();
const orchestratorBaseUrl = resolveOrchestratorBaseUrl();
const uiDevUrl = resolveUiDevUrl();
const startupMode = process.env.SMART_MEMORY_START_MODE?.trim() || "autostart";

let shuttingDown = false;

async function maybeBuildForApp() {
  if (mode !== "app") {
    return;
  }

  await runCommand({
    command: process.execPath,
    args: ["scripts/build.mjs"],
    cwd: process.cwd(),
    label: "workspace build",
  });
}

async function startSmartMemory() {
  const explicitCommand = process.env.SMART_MEMORY_COMMAND?.trim();
  const launchSpec = resolveSmartMemoryLaunch({
    projectRoot: process.env.SMART_MEMORY_PROJECT_ROOT?.trim() || SMART_MEMORY_DIR,
    host: DEFAULT_SMART_MEMORY_HOST,
    port: DEFAULT_SMART_MEMORY_PORT,
  });

  if (!explicitCommand && !fileExists(launchSpec.command)) {
    throw new Error(
      `Smart Memory virtualenv was not found at ${launchSpec.command}. Run the project install first.`,
    );
  }

  const result = await ensureServiceRunning({
    mode: startupMode,
    probeReady: async () => fetch(`${smartMemoryBaseUrl}/health`).then((response) => response.ok).catch(() => false),
    startProcess: async () => {
      const child = spawnManagedProcess({
        command: launchSpec.command,
        args: launchSpec.args,
        cwd: launchSpec.cwd,
      });
      children.push(child);
      return child;
    },
    waitForReady: async () =>
      waitForHttp(`${smartMemoryBaseUrl}/health`, {
        timeoutMs: Number(process.env.SMART_MEMORY_STARTUP_TIMEOUT_MS ?? 120000),
        label: "Smart Memory",
      }),
    terminateProcess: terminateChild,
  });

  if (result.state === "manual") {
    throw new Error(
      "Smart Memory is not running and SMART_MEMORY_START_MODE=manual prevented auto-start.",
    );
  }
}

async function startOrchestrator() {
  const child = spawnManagedProcess({
    command: npmCommand(),
    args: ["run", mode === "app" ? "start" : "dev"],
    cwd: ORCHESTRATOR_DIR,
    env: {
      HOST: DEFAULT_ORCHESTRATOR_HOST,
      PORT: String(DEFAULT_ORCHESTRATOR_PORT),
      SMART_MEMORY_HOST: DEFAULT_SMART_MEMORY_HOST,
      SMART_MEMORY_PORT: String(DEFAULT_SMART_MEMORY_PORT),
      SMART_MEMORY_PROJECT_ROOT: process.env.SMART_MEMORY_PROJECT_ROOT?.trim() || SMART_MEMORY_DIR,
      SMART_MEMORY_START_MODE: "manual",
      UI_SERVING_MODE: mode === "app" ? "static" : "external",
      UI_DEV_SERVER_URL: uiDevUrl,
    },
  });
  children.push(child);

  await waitForHttp(`${orchestratorBaseUrl}/api/health`, {
    timeoutMs: Number(process.env.ORCHESTRATOR_STARTUP_TIMEOUT_MS ?? 120000),
    label: "orchestrator",
  });
}

async function startUiDevServer() {
  if (mode !== "dev") {
    return;
  }

  const child = spawnManagedProcess({
    command: npmCommand(),
    args: ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(DEFAULT_UI_PORT)],
    cwd: UI_DIR,
    env: {
      VITE_ORCHESTRATOR_BASE_URL: orchestratorBaseUrl,
    },
  });
  children.push(child);

  await waitForHttp(uiDevUrl, {
    timeoutMs: Number(process.env.UI_STARTUP_TIMEOUT_MS ?? 120000),
    label: "UI dev server",
  });
}

async function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  await shutdownManagedChildren(children, terminateChild);
}

process.on("SIGINT", async () => {
  await shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});

try {
  await maybeBuildForApp();
  await startSmartMemory();
  await startOrchestrator();
  await startUiDevServer();

  const uiUrl = mode === "app" ? orchestratorBaseUrl : uiDevUrl;
  console.log("");
  console.log(`Smart Memory: ${smartMemoryBaseUrl}`);
  console.log(`Orchestrator API: ${orchestratorBaseUrl}/api`);
  console.log(`UI: ${uiUrl}`);
  console.log("");
} catch (error) {
  console.error(toError(error));
  await shutdown();
  process.exit(1);
}

function toError(error) {
  return error instanceof Error ? error.message : String(error);
}
