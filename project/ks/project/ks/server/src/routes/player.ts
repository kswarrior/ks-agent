import { Hono } from "hono";
import { z } from "zod";

export const playerRoutes = new Hono();

// GET /api/players - List all players
playerRoutes.get("/", (c) => {
  const players = c.env ? c.env.PLAYERS || [] : [];
  return c.json({ success: true, data: players });
});

// POST /api/players - Create/add a player
playerRoutes.post("/", (c) => {
  const body = await c.req.json();
  const playerSchema = z.object({
    uuid: z.string(),
    name: z.string(),
    ip: z.string().optional(),
    lastSeen: z.string().optional(),
  });
  const result = playerSchema.safeParse(body);
  if (!result.success) {
    return c.json({ success: false, error: "Invalid player data" }, 400);
  }
  const player = result.data;
  return c.json({ success: true, data: player });
});

// GET /api/players/:uuid - Get player by UUID
playerRoutes.get("/:uuid", (c) => {
  const { uuid } = c.req.param();
  const players = c.env ? c.env.PLAYERS || [] : [];
  const player = players.find((p: any) => p.uuid === uuid);
  if (!player) {
    return c.json({ success: false, error: "Player not found" }, 404);
  }
  return c.json({ success: true, data: player });
});

// PUT /api/players/:uuid - Update player
playerRoutes.put("/:uuid", (c) => {
  const { uuid } = c.req.param();
  const body = await c.req.json();
  return c.json({ success: true, data: { uuid, ...body } });
});

// DELETE /api/players/:uuid - Delete player
playerRoutes.delete("/:uuid", (c) => {
  const { uuid } = c.req.param();
  return c.json({ success: true, data: { deleted: uuid } });
});