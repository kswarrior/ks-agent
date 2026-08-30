import { Hono } from 'hono';

const app = new Hono();

// API routes will be added here
app.get('/api/health', (c) => {
  return c.json({ status: 'ok' });
});

export default app;