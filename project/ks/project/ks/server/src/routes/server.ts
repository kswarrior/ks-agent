import { Hono } from "hono";
import { z } from "zod";

export const serverRoutes = new Hono();

// GET /api/servers - List all servers
serverRoutes.get("/", (c) => {
  const servers = c.env ? c.env.SERVERS || [] : [];
  return c.json({ success: true, data: servers });
});

// POST /api/servers - Create/add a server
serverRoutes.post("/", (c) => {
  const body = await c.req.json();
  const serverSchema = z.object({
    id: z.string(),
    name: z.string(),
    host: z.string(),
    port: z.number().default(25565),
    status: z.enum(["online", "offline", "starting", "stopping"]).default("offline"),
    maxPlayers: z.number().default(100),
    currentPlayers: z.number().default(0),
    version: z.string().default("1.20.1"),
  });
  const result = serverSchema.safeParse(body);
  if (!result.success) {
    return c.json({ success: false, error: "Invalid server data" }, 400);
  }
  const server = result.data;
  return c.json({ success: true, data: server });
});

// GET /api/servers/:id - Get server by ID
serverRoutes.get("/:id", (c) => {
  const { id } = c.req.param();
  const servers = c.env ? c.env.SERVERS || [] : [];
  const server = servers.find((s: any) => s.id === id);
  if (!server) {
    return c.json({ success: false, error: "Server not found" }, 404);
  }
  return c.json({ success: true, data: server });
});

// PUT /api/servers/:id - Update server
serverRoutes.put("/:id", (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  return c.json({ success: true, data: { id, ...body } });
});

// POST /api/servers/:id/start - Start server
serverRoutes.post("/:id/start", (c) => {
  const { id } = c.req.param();
  return c.json({ success: true, data: { id, action: "started" }, message: "Server starting..." });
});

// POST /api/servers/:id/stop - Stop server
serverRoutes.post("/:id/stop", (c) => {
  const { id } = c.req.param();
  return c.json({ success: true, data: { id, action: "stopped" }, message: "Server stopping..." });
});

// POST /api/servers/:id/restart - Restart server
serverRoutes.post("/:id/restart", (c) => {
  const { id } = c.req.param();
  return c.json({ success: true, data: { id, action: "restarted" }, message: "Server restarting..." });
});