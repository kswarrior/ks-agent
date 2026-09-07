import { Hono } from "hono";
import { playerRoutes } from "./routes/player";
import { serverRoutes } from "./routes/server";
import { cors } from "hono/cors";

const app = new Hono();

app.use(
  cors({
    origin: ["http://localhost:5173"],
    allowMethods: ["GET", "POST", "PUT", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.route("/api/players", playerRoutes);
app.route("/api/servers", serverRoutes);

export { app };