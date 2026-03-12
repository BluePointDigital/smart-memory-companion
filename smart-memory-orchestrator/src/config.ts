import path from "node:path";

import rawConfig, {
  type OrchestratorConfig,
  type SmartMemoryStartMode,
  type UiServingMode,
} from "../orchestrator.config.js";

const START_MODES: SmartMemoryStartMode[] = ["detect", "autostart", "manual"];
const UI_MODES: UiServingMode[] = ["external", "static", "disabled"];

export type ResolvedOrchestratorConfig = OrchestratorConfig & {
  smartMemory: OrchestratorConfig["smartMemory"] & {
    baseUrl: string;
    projectRoot: string;
  };
  uiServing: OrchestratorConfig["uiServing"] & {
    distPath: string;
  };
};

function ensureMode<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if (!allowed.includes(value as T)) {
    throw new Error(`${label} must be one of ${allowed.join(", ")}`);
  }

  return value as T;
}

function ensurePositiveNumber(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }

  return value;
}

function ensurePort(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${label} must be an integer between 1 and 65535`);
  }

  return value;
}

function ensureCommand(command: string[] | undefined): string[] | undefined {
  if (!command) {
    return undefined;
  }

  const sanitized = command.map((part) => part.trim()).filter(Boolean);
  if (sanitized.length === 0) {
    throw new Error("smartMemory.command must include at least one executable");
  }

  return sanitized;
}

export function resolveConfig(input: OrchestratorConfig = rawConfig): ResolvedOrchestratorConfig {
  const startMode = ensureMode(
    input.smartMemory.startMode,
    START_MODES,
    "smartMemory.startMode",
  );
  const uiMode = ensureMode(input.uiServing.mode, UI_MODES, "uiServing.mode");
  const smartMemoryPort = ensurePort(input.smartMemory.port, "smartMemory.port");
  const readinessTimeout = ensurePositiveNumber(
    input.readiness.timeoutMs,
    "readiness.timeoutMs",
  );
  const readinessPollInterval = ensurePositiveNumber(
    input.readiness.pollIntervalMs,
    "readiness.pollIntervalMs",
  );
  const transcriptWindowDefault = ensurePositiveNumber(
    input.workspace.transcriptWindowDefault,
    "workspace.transcriptWindowDefault",
  );
  const command = ensureCommand(input.smartMemory.command);
  const projectRoot = path.resolve(input.smartMemory.projectRoot);
  const distPath = path.resolve(input.uiServing.distPath);

  return {
    ...input,
    smartMemory: {
      ...input.smartMemory,
      startMode,
      command,
      host: input.smartMemory.host.trim() || "127.0.0.1",
      port: smartMemoryPort,
      projectRoot,
      baseUrl: `http://${input.smartMemory.host.trim() || "127.0.0.1"}:${smartMemoryPort}`,
    },
    uiServing: {
      ...input.uiServing,
      mode: uiMode,
      distPath,
      devServerUrl: input.uiServing.devServerUrl?.trim() || undefined,
    },
    readiness: {
      timeoutMs: readinessTimeout,
      pollIntervalMs: readinessPollInterval,
    },
    workspace: {
      transcriptWindowDefault,
    },
  };
}

const config = resolveConfig(rawConfig);

export default config;
