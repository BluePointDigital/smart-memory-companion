import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_ROOT = join(import.meta.dirname, "..", "fixtures", "smart-memory");

export function loadFixture<T>(name: string): T {
  const path = join(FIXTURE_ROOT, name);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
