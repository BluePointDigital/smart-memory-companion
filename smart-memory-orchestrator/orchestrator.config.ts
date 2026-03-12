import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  bundleSummaryHook,
  episodicReferenceHook,
  subjectHintsHook,
  type OrchestratorHook,
} from "./src/hooks.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot =
  path.basename(__dirname) === "dist" ? path.resolve(__dirname, "..") : __dirname;
const workspaceRoot = path.resolve(packageRoot, "..");
const localSmartMemoryRoot = path.resolve(workspaceRoot, "smart-memory");
const siblingSmartMemoryRoot = path.resolve(workspaceRoot, "..", "smart-memory");

export type SmartMemoryStartMode = "detect" | "autostart" | "manual";
export type UiServingMode = "external" | "static" | "disabled";

export type OrchestratorConfig = {
  smartMemory: {
    startMode: SmartMemoryStartMode;
    projectRoot: string;
    command?: string[];
    host: string;
    port: number;
  };
  uiServing: {
    mode: UiServingMode;
    distPath: string;
    devServerUrl?: string;
  };
  hooks: OrchestratorHook[];
  runtimeAdapters: {
    openclaw: {
      enabled: boolean;
    };
  };
  readiness: {
    timeoutMs: number;
    pollIntervalMs: number;
  };
  workspace: {
    transcriptWindowDefault: number;
  };
};

function parseCommand(value: string | undefined): string[] | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
        return parsed;
      }
    } catch {
      // Fall back to token parsing below.
    }
  }

  const matches = trimmed.match(/"[^"]+"|'[^']+'|\S+/g);
  return matches?.map((part) => part.replace(/^['"]|['"]$/g, "")) ?? undefined;
}

function resolveSmartMemoryProjectRoot(): string {
  const envPath = process.env.SMART_MEMORY_PROJECT_ROOT?.trim();
  if (envPath) {
    return envPath;
  }

  if (pathExists(localSmartMemoryRoot)) {
    return localSmartMemoryRoot;
  }

  if (pathExists(siblingSmartMemoryRoot)) {
    return siblingSmartMemoryRoot;
  }

  return siblingSmartMemoryRoot;
}

function pathExists(targetPath: string): boolean {
  try {
    return !!targetPath && fs.existsSync(path.resolve(targetPath));
  } catch {
    return false;
  }
}

const smartMemoryHost = process.env.SMART_MEMORY_HOST?.trim() || "127.0.0.1";
const smartMemoryPort = Number(process.env.SMART_MEMORY_PORT ?? 8000);
const smartMemoryProjectRoot = resolveSmartMemoryProjectRoot();
const smartMemoryCommand = parseCommand(process.env.SMART_MEMORY_COMMAND);
const uiServingMode = process.env.UI_SERVING_MODE?.trim() || "external";
const uiDistPath =
  process.env.UI_DIST_PATH?.trim() || path.resolve(workspaceRoot, "smart-memory-ui/dist");
const uiDevServerUrl =
  process.env.UI_DEV_SERVER_URL?.trim() || "http://127.0.0.1:5173";

const config: OrchestratorConfig = {
  smartMemory: {
    startMode:
      (process.env.SMART_MEMORY_START_MODE?.trim() as SmartMemoryStartMode | undefined) ??
      "detect",
    projectRoot: smartMemoryProjectRoot,
    command: smartMemoryCommand,
    host: smartMemoryHost,
    port: smartMemoryPort,
  },
  uiServing: {
    mode: uiServingMode as UiServingMode,
    distPath: uiDistPath,
    devServerUrl: uiServingMode === "external" ? uiDevServerUrl : undefined,
  },
  hooks: [subjectHintsHook, episodicReferenceHook, bundleSummaryHook],
  runtimeAdapters: {
    openclaw: {
      enabled: process.env.OPENCLAW_ADAPTER_ENABLED !== "0",
    },
  },
  readiness: {
    timeoutMs: Number(process.env.ORCHESTRATOR_READINESS_TIMEOUT_MS ?? 120000),
    pollIntervalMs: Number(process.env.ORCHESTRATOR_READINESS_POLL_INTERVAL_MS ?? 300),
  },
  workspace: {
    transcriptWindowDefault: Number(process.env.TRANSCRIPT_WINDOW_DEFAULT ?? 12),
  },
};

export default config;
