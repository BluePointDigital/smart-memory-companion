import process from "node:process";

import {
  DEFAULT_ORCHESTRATOR_HOST,
  DEFAULT_ORCHESTRATOR_PORT,
  DEFAULT_SMART_MEMORY_HOST,
  DEFAULT_SMART_MEMORY_PORT,
  ORCHESTRATOR_DIR,
  SMART_MEMORY_DIR,
  UI_DIR,
  fileExists,
  isHttpReady,
  isPortAvailable,
  resolveVenvPython,
} from "./lib/shared.mjs";

const smartMemoryHealthUrl = `http://${DEFAULT_SMART_MEMORY_HOST}:${DEFAULT_SMART_MEMORY_PORT}/health`;
const orchestratorHealthUrl = `http://${DEFAULT_ORCHESTRATOR_HOST}:${DEFAULT_ORCHESTRATOR_PORT}/api/health`;
const smartMemoryHealthy = await isHttpReady(smartMemoryHealthUrl);
const orchestratorHealthy = await isHttpReady(orchestratorHealthUrl);
const smartMemoryPortAvailable = await isPortAvailable(
  DEFAULT_SMART_MEMORY_PORT,
  DEFAULT_SMART_MEMORY_HOST,
);
const orchestratorPortAvailable = await isPortAvailable(
  DEFAULT_ORCHESTRATOR_PORT,
  DEFAULT_ORCHESTRATOR_HOST,
);

const checks = [
  {
    label: "Node version",
    ok: Number(process.versions.node.split(".")[0]) >= 20,
    detail: process.versions.node,
  },
  {
    label: "Smart Memory project root",
    ok: fileExists(SMART_MEMORY_DIR),
    detail: SMART_MEMORY_DIR,
  },
  {
    label: "Smart Memory virtualenv",
    ok: fileExists(resolveVenvPython(SMART_MEMORY_DIR)),
    detail: resolveVenvPython(SMART_MEMORY_DIR),
  },
  {
    label: "Orchestrator dependencies",
    ok: fileExists(`${ORCHESTRATOR_DIR}/node_modules`),
    detail: `${ORCHESTRATOR_DIR}/node_modules`,
  },
  {
    label: "UI dependencies",
    ok: fileExists(`${UI_DIR}/node_modules`),
    detail: `${UI_DIR}/node_modules`,
  },
  {
    label: "Smart Memory port state",
    ok: smartMemoryPortAvailable || smartMemoryHealthy,
    detail: smartMemoryPortAvailable
      ? `${DEFAULT_SMART_MEMORY_HOST}:${DEFAULT_SMART_MEMORY_PORT} is free`
      : `${DEFAULT_SMART_MEMORY_HOST}:${DEFAULT_SMART_MEMORY_PORT} is in use`,
  },
  {
    label: "Orchestrator port state",
    ok: orchestratorPortAvailable || orchestratorHealthy,
    detail: orchestratorPortAvailable
      ? `${DEFAULT_ORCHESTRATOR_HOST}:${DEFAULT_ORCHESTRATOR_PORT} is free`
      : `${DEFAULT_ORCHESTRATOR_HOST}:${DEFAULT_ORCHESTRATOR_PORT} is in use`,
  },
  {
    label: "Smart Memory health",
    ok: smartMemoryHealthy,
    detail: smartMemoryHealthUrl,
  },
  {
    label: "Orchestrator health",
    ok: orchestratorHealthy,
    detail: orchestratorHealthUrl,
  },
];

let failures = 0;
for (const check of checks) {
  const prefix = check.ok ? "[ok]" : "[fail]";
  if (!check.ok) {
    failures += 1;
  }
  console.log(`${prefix} ${check.label}: ${check.detail}`);
}

if (failures > 0) {
  process.exit(1);
}
