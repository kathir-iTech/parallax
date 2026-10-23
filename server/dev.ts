import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createServer as createViteServer } from "vite";

// Explicit local environment file; ignored by Git. No values are logged.
const env = resolve(".env.local");
if (existsSync(env)) process.loadEnvFile(env);
if (!process.env.QLOO_API_KEY && process.env.QLOO_KEY_FILE)
  process.env.QLOO_API_KEY = readFileSync(process.env.QLOO_KEY_FILE, "utf8")
    .replace(/^\uFEFF/, "")
    .trim();
const { default: handler } = await import("./handler.ts");
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "spa",
});
const port = Number(process.env.PORT ?? 4317);
createServer((req, res) => {
  if (req.url?.startsWith("/api/")) void handler(req, res);
  else vite.middlewares(req, res);
}).listen(port, "127.0.0.1", () =>
  console.log(`PARALLAX local preview: http://127.0.0.1:${port}`),
);
