import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
);
const version = process.env.RELEASE_VERSION?.trim() || `v${packageJson.version ?? "0.1.0"}`;
const artifactName = `smart-memory-companion-${version}`;
const artifactsDir = path.join(rootDir, "artifacts");
const stagingDir = path.join(artifactsDir, artifactName);

const ignoredDirectories = new Set([
  ".git",
  ".github",
  "artifacts",
  "node_modules",
  "dist",
  "coverage",
  "data",
  "smart-memory",
]);

const ignoredFileNames = new Set([
  ".DS_Store",
  "Thumbs.db",
  "tsconfig.tsbuildinfo",
]);

function shouldSkip(relativePath, name, isDirectory) {
  if (ignoredFileNames.has(name)) {
    return true;
  }

  if (isDirectory && ignoredDirectories.has(name)) {
    return true;
  }

  if (relativePath.startsWith(".git")) {
    return true;
  }

  if (name.endsWith(".pem") || name.endsWith(".key")) {
    return true;
  }

  return false;
}

function copyTree(sourceDir, targetDir, relativeBase = "") {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const relativePath = relativeBase ? path.join(relativeBase, entry.name) : entry.name;
    if (shouldSkip(relativePath, entry.name, entry.isDirectory())) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyTree(sourcePath, targetPath, relativePath);
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
}

fs.rmSync(stagingDir, { recursive: true, force: true });
copyTree(rootDir, stagingDir);

console.log(`Prepared release staging directory: ${stagingDir}`);
