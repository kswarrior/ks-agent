import { app } from "./src/index.ts";
import { serve } from "@hono/node-server";
import fastify from "fastify";

const port = process.env.PORT ? Number(process.env.PORT) : 8080;

fastify({
  onRequest: app.fetch,
  logger: true
}).listen({ port }, (err, address) => {
  if (err) {
    console.error("Server failed to start:", err);
    process.exit(1);
  }
  console.log(`� KS Panel API running at: ${address}`);
  console.log(`📡 Players API: http://localhost:${port}/api/players`);
  console.log(`🖥️  Servers API: http://localhost:${port}/api/servers`);
});