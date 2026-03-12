import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 4100);
const host = process.env.HOST ?? "127.0.0.1";

const app = await buildApp();

await app.listen({
  port,
  host,
});
