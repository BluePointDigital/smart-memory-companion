import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, "..", "..");
export const ORCHESTRATOR_DIR = path.join(ROOT_DIR, "smart-memory-orchestrator");
export const UI_DIR = path.join(ROOT_DIR, "smart-memory-ui");
const localSmartMemoryDir = path.join(ROOT_DIR, "smart-memory");
const siblingSmartMemoryDir = path.resolve(ROOT_DIR, "..", "smart-memory");
export const SMART_MEMORY_DIR =
  process.env.SMART_MEMORY_PROJECT_ROOT?.trim() ||
  (fileExists(localSmartMemoryDir)
    ? localSmartMemoryDir
    : fileExists(siblingSmartMemoryDir)
      ? siblingSmartMemoryDir
      : localSmartMemoryDir);
export const DEFAULT_SMART_MEMORY_HOST =
  process.env.SMART_MEMORY_HOST?.trim() || "127.0.0.1";
export const DEFAULT_SMART_MEMORY_PORT = Number(process.env.SMART_MEMORY_PORT ?? 8000);
export const DEFAULT_ORCHESTRATOR_HOST = process.env.ORCHESTRATOR_HOST?.trim() || "127.0.0.1";
export const DEFAULT_ORCHESTRATOR_PORT = Number(process.env.ORCHESTRATOR_PORT ?? 4100);
export const DEFAULT_UI_PORT = Number(process.env.UI_PORT ?? 5173);

export function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveSmartMemoryBaseUrl() {
  return `http://${DEFAULT_SMART_MEMORY_HOST}:${DEFAULT_SMART_MEMORY_PORT}`;
}

export function resolveOrchestratorBaseUrl() {
  return `http://${DEFAULT_ORCHESTRATOR_HOST}:${DEFAULT_ORCHESTRATOR_PORT}`;
}

export function resolveUiDevUrl() {
  return `http://127.0.0.1:${DEFAULT_UI_PORT}`;
}

export function resolveVenvPython(projectRoot = SMART_MEMORY_DIR) {
  return process.platform === "win32"
    ? path.join(projectRoot, ".venv", "Scripts", "python.exe")
    : path.join(projectRoot, ".venv", "bin", "python");
}

export function resolveSmartMemoryLaunch({
  projectRoot = SMART_MEMORY_DIR,
  host = DEFAULT_SMART_MEMORY_HOST,
  port = DEFAULT_SMART_MEMORY_PORT,
  command,
} = {}) {
  if (command?.length) {
    const [executable, ...args] = command;
    return {
      command: executable,
      args,
      cwd: projectRoot,
    };
  }

  const python = resolveVenvPython(projectRoot);
  return {
    command: python,
    args: ["-m", "uvicorn", "server:app", "--host", host, "--port", String(port)],
    cwd: projectRoot,
  };
}

export function spawnManagedProcess({ command, args, cwd, env = {}, stdio = "inherit" }) {
  const mergedEnv = Object.fromEntries(
    Object.entries({
      ...process.env,
      ...env,
    }).filter(([, value]) => value !== undefined),
  );
  const useCmdWrapper = process.platform === "win32" && /\.(cmd|bat)$/i.test(command);

  const resolvedCommand = useCmdWrapper ? process.env.ComSpec || "cmd.exe" : command;
  const resolvedArgs = useCmdWrapper ? ["/d", "/s", "/c", command, ...args] : args;

  return spawn(resolvedCommand, resolvedArgs, {
    cwd,
    env: mergedEnv,
    stdio,
    windowsHide: true,
  });
}

export async function runCommand({
  command,
  args,
  cwd,
  env = {},
  label,
}) {
  await new Promise((resolve, reject) => {
    const child = spawnManagedProcess({
      command,
      args,
      cwd,
      env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label ?? command} exited with code ${code ?? "unknown"}`));
      }
    });
  });
}

export async function isHttpReady(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

export async function waitForHttp(url, { timeoutMs = 120000, intervalMs = 300, label } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isHttpReady(url)) {
      return;
    }
    await sleep(intervalMs);
  }

  throw new Error(`${label ?? url} did not become ready within ${timeoutMs}ms`);
}

export async function isPortAvailable(port, host = "127.0.0.1") {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

export function terminateChild(child) {
  if (!child?.pid) {
    return;
  }

  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      return;
    }

    child.kill("SIGTERM");
  } catch {
    // Best effort shutdown.
  }
}

export function fileExists(targetPath) {
  return fs.existsSync(targetPath);
}
