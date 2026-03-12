import { npmCommand, ORCHESTRATOR_DIR, ROOT_DIR, UI_DIR, runCommand } from "./lib/shared.mjs";

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
  args: ["run", "build"],
  cwd: ORCHESTRATOR_DIR,
  label: "orchestrator build",
});

await runCommand({
  command: npmCommand(),
  args: ["run", "build"],
  cwd: UI_DIR,
  label: "ui build",
});

console.log(`Build complete for workspace at ${ROOT_DIR}`);
