import {
  npmCommand,
  ORCHESTRATOR_DIR,
  ROOT_DIR,
  UI_DIR,
  runCommand,
} from "./lib/shared.mjs";

await runCommand({
  command: process.execPath,
  args: ["--test", "scripts/tests/launcher.test.mjs"],
  cwd: ROOT_DIR,
  label: "workspace launcher tests",
});

await runCommand({
  command: npmCommand(),
  args: ["run", "test"],
  cwd: ORCHESTRATOR_DIR,
  label: "orchestrator tests",
});

await runCommand({
  command: npmCommand(),
  args: ["run", "export:openapi"],
  cwd: ORCHESTRATOR_DIR,
  label: "orchestrator openapi export",
});

await runCommand({
  command: npmCommand(),
  args: ["run", "generate:api"],
  cwd: UI_DIR,
  label: "ui api generation",
});

await runCommand({
  command: npmCommand(),
  args: ["run", "test"],
  cwd: UI_DIR,
  label: "ui tests",
});

console.log("All workspace tests passed.");
