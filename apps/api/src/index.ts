import Fastify from "fastify";
import cors from "@fastify/cors";
import { projectRoutes } from "./routes/projects.js";
import { deployRoutes } from "./routes/deploy.js";

const app = Fastify({ logger: { level: "info" } });

await app.register(cors, {
  origin: process.env["CORS_ORIGIN"] ?? "http://localhost:3000",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});

await app.register(projectRoutes);
await app.register(deployRoutes);

const port = Number(process.env["PORT"] ?? 3001);
const host = process.env["HOST"] ?? "0.0.0.0";

try {
  await app.listen({ port, host });
  console.log(`API running on http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
