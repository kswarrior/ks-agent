import { Hono } from "hono";

const app = new Hono();

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Console endpoint - get console output
app.get("/api/console", (c) => c.json({ output: "Minecraft server console ready" }));

// Console command endpoint
app.post("/api/console/command", (c) => {
  const { command } = await c.req.json();
  return c.json({ result: `Executed: ${command}` });
});

// Files endpoint - list files
app.get("/api/files", (c) => c.json({ files: ["server.properties", "spigot.jar", "plugins"] }));

// Files - read file
app.get("/api/files/:path", (c) => {
  const filePath = c.req.param("path");
  return c.json({ content: `Content of ${filePath}` });
});

// Files - write file
app.post("/api/files/:path", async (c) => {
  const { content } = await c.req.json();
  const filePath = c.req.param("path");
  return c.json({ saved: `Saved ${filePath}`, length: content.length });
});

export default app;