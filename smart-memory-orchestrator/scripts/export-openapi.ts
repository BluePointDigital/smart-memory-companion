import { writeFile } from "node:fs/promises";

import { buildApp } from "../src/app.js";

const app = await buildApp();

await app.ready();
await writeFile("openapi.json", JSON.stringify(app.swagger(), null, 2), "utf8");
await app.close();
