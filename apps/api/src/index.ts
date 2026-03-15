import { buildApp } from "./app.js";

const port = Number(process.env["PORT"] ?? 3001);
const host = process.env["HOST"] ?? "0.0.0.0";

try {
  const app = await buildApp();
  await app.listen({ port, host });
  console.log(`API running on http://${host}:${port}`);
} catch (err) {
  console.error(err);
  process.exit(1);
}
