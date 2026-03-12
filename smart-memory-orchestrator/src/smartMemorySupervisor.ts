import { ChildProcess, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { type ResolvedOrchestratorConfig } from "./config.js";
import { SmartMemoryCapabilities, SystemStatus } from "./contracts.js";
import { SmartMemoryClient } from "./smartMemoryClient.js";
import { nowIso } from "./utils.js";

type SmartMemoryState = "connected" | "starting" | "offline" | "error" | "manual_wait";

type LaunchSpec = {
  command: string;
  args: string[];
  cwd: string;
};

function isWindows(): boolean {
  return process.platform === "win32";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emptyCapabilities(baseUrl: string): SmartMemoryCapabilities {
  return {
    base_url: baseUrl,
    healthy: false,
    health_status: "offline",
    openapi_available: false,
    version: undefined,
    endpoints: {
      memories: false,
      memory_detail: false,
      memory_history: false,
      memory_chain: false,
      memory_evidence: false,
      retrieve: false,
      transcripts: false,
      transcript_message: false,
      lanes: false,
      rebuild: false,
      rebuild_session: false,
      ingest: false,
      append_transcript: false,
    },
    degraded: ["health"],
  };
}

function resolveVenvPython(projectRoot: string): string {
  return isWindows()
    ? path.join(projectRoot, ".venv", "Scripts", "python.exe")
    : path.join(projectRoot, ".venv", "bin", "python");
}

export class SmartMemorySupervisor {
  private readonly client: SmartMemoryClient;
  private readonly config: ResolvedOrchestratorConfig;
  private capabilities: SmartMemoryCapabilities;
  private state: SmartMemoryState;
  private lastError: string | null;
  private readonly startupErrors: string[];
  private child: ChildProcess | null;
  private ownsProcess: boolean;
  private lastCheckedAt: string;

  constructor(params: {
    client: SmartMemoryClient;
    config: ResolvedOrchestratorConfig;
  }) {
    this.client = params.client;
    this.config = params.config;
    this.capabilities = emptyCapabilities(params.config.smartMemory.baseUrl);
    this.state =
      params.config.smartMemory.startMode === "manual" ? "manual_wait" : "offline";
    this.lastError = null;
    this.startupErrors = [];
    this.child = null;
    this.ownsProcess = false;
    this.lastCheckedAt = nowIso();
  }

  async boot(): Promise<void> {
    await this.refreshStatus();

    if (this.capabilities.healthy || this.config.smartMemory.startMode !== "autostart") {
      return;
    }

    await this.startOwnedProcess();
    await this.refreshStatus();
  }

  async refreshStatus(): Promise<SmartMemoryCapabilities> {
    try {
      this.capabilities = await this.client.probeCapabilities();
      this.lastCheckedAt = nowIso();
      if (this.capabilities.healthy) {
        this.state = "connected";
        this.lastError = null;
      } else if (this.config.smartMemory.startMode === "manual") {
        this.state = "manual_wait";
      } else if (this.state !== "starting") {
        this.state = "offline";
      }
    } catch (error) {
      this.capabilities = emptyCapabilities(this.config.smartMemory.baseUrl);
      this.lastCheckedAt = nowIso();
      this.lastError = error instanceof Error ? error.message : String(error);
      this.state = this.config.smartMemory.startMode === "manual" ? "manual_wait" : "error";
    }

    return this.capabilities;
  }

  noteStartupError(message: string): void {
    this.lastError = message;
    this.startupErrors.push(message);
    this.state = "error";
  }

  getStatus(orchestratorOrigin: string): SystemStatus {
    const uiUrl =
      this.config.uiServing.mode === "external"
        ? this.config.uiServing.devServerUrl ?? orchestratorOrigin
        : orchestratorOrigin;
    const uiAvailable =
      this.config.uiServing.mode === "static"
        ? fs.existsSync(this.config.uiServing.distPath)
        : this.config.uiServing.mode === "external"
          ? Boolean(this.config.uiServing.devServerUrl)
          : false;

    return {
      status: this.capabilities.healthy ? "ok" : "degraded",
      service: "smart-memory-orchestrator",
      ready: this.capabilities.healthy,
      last_checked_at: this.lastCheckedAt,
      startup_errors: [...this.startupErrors],
      smart_memory: {
        base_url: this.config.smartMemory.baseUrl,
        start_mode: this.config.smartMemory.startMode,
        state: this.state,
        healthy: this.capabilities.healthy,
        owns_process: this.ownsProcess,
        last_error: this.lastError,
        project_root: this.config.smartMemory.projectRoot,
        capabilities: this.capabilities,
      },
      ui_serving: {
        mode: this.config.uiServing.mode,
        available: uiAvailable,
        dist_path:
          this.config.uiServing.mode === "static"
            ? this.config.uiServing.distPath
            : undefined,
        dev_server_url:
          this.config.uiServing.mode === "external"
            ? this.config.uiServing.devServerUrl
            : undefined,
      },
      urls: {
        orchestrator: orchestratorOrigin,
        api_base: `${orchestratorOrigin}/api`,
        ui: uiUrl,
        smart_memory: this.config.smartMemory.baseUrl,
      },
    };
  }

  async close(): Promise<void> {
    if (!this.child || !this.ownsProcess) {
      return;
    }

    const pid = this.child.pid;
    this.child = null;
    this.ownsProcess = false;

    if (!pid) {
      return;
    }

    try {
      if (isWindows()) {
        spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } else {
        process.kill(pid, "SIGTERM");
      }
    } catch {
      // Best effort shutdown.
    }
  }

  private async startOwnedProcess(): Promise<void> {
    const launchSpec = this.resolveLaunchSpec();
    if (!launchSpec) {
      return;
    }

    this.state = "starting";
    this.child = spawn(launchSpec.command, launchSpec.args, {
      cwd: launchSpec.cwd,
      stdio: "ignore",
      windowsHide: true,
    });
    this.ownsProcess = true;

    this.child.on("exit", (code) => {
      this.ownsProcess = false;
      this.child = null;
      if (!this.capabilities.healthy) {
        this.state = "error";
        this.lastError = `Smart Memory exited before readiness (code: ${code ?? "unknown"})`;
      }
    });

    try {
      await this.waitForHealthy();
      this.state = "connected";
      this.lastError = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.noteStartupError(message);
    }
  }

  private resolveLaunchSpec(): LaunchSpec | null {
    if (this.config.smartMemory.command?.length) {
      const [command, ...args] = this.config.smartMemory.command;
      if (!command) {
        this.noteStartupError("smartMemory.command did not resolve to an executable");
        return null;
      }

      return {
        command,
        args,
        cwd: this.config.smartMemory.projectRoot,
      };
    }

    const python = resolveVenvPython(this.config.smartMemory.projectRoot);
    if (!fs.existsSync(python)) {
      this.noteStartupError(
        `Smart Memory Python virtualenv was not found at ${python}`,
      );
      return null;
    }

    return {
      command: python,
      args: [
        "-m",
        "uvicorn",
        "server:app",
        "--host",
        this.config.smartMemory.host,
        "--port",
        String(this.config.smartMemory.port),
      ],
      cwd: this.config.smartMemory.projectRoot,
    };
  }

  private async waitForHealthy(): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < this.config.readiness.timeoutMs) {
      try {
        const health = await this.client.fetchHealth();
        if (health.status === "ok" || health.status === "degraded") {
          return;
        }
      } catch {
        // Keep polling until timeout.
      }

      await sleep(this.config.readiness.pollIntervalMs);
    }

    throw new Error(
      `Smart Memory did not become healthy within ${this.config.readiness.timeoutMs}ms`,
    );
  }
}
