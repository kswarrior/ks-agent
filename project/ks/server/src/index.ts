import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { WebSocketServer } from 'ws';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const app = new Hono();
app.use('*', cors());

const DATA_DIR = './data';
const DB_FILE = join(DATA_DIR, 'db.json');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

function loadDB() {
  if (!existsSync(DB_FILE)) {
    const init = { servers: [], players: [], files: [], backups: [], settings: { owner: 'KS Warrior', panelName: 'KS Panel' } };
    writeFileSync(DB_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  return JSON.parse(readFileSync(DB_FILE, 'utf-8'));
}

function saveDB(data: any) {
  writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

app.get('/api/health', (c) => c.json({ status: 'ok', owner: 'KS Warrior', panel: 'KS Panel' }));

app.get('/api/servers', (c) => {
  const db = loadDB();
  return c.json(db.servers);
});

app.post('/api/servers', async (c) => {
  const body = await c.req.json();
  const db = loadDB();
  const server = { id: Date.now().toString(), ...body, status: 'stopped', createdAt: new Date().toISOString() };
  db.servers.push(server);
  saveDB(db);
  return c.json(server);
});

app.patch('/api/servers/:id/status', async (c) => {
  const id = c.req.param('id');
  const { action } = await c.req.json();
  const db = loadDB();
  const server = db.servers.find((s: any) => s.id === id);
  if (!server) return c.json({ error: 'Not found' }, 404);
  server.status = action === 'start' ? 'running' : action === 'stop' ? 'stopped' : server.status;
  saveDB(db);
  return c.json(server);
});

app.get('/api/players', (c) => {
  const db = loadDB();
  return c.json(db.players);
});

app.get('/api/files', (c) => {
  const db = loadDB();
  return c.json(db.files);
});

app.post('/api/backups', async (c) => {
  const body = await c.req.json();
  const db = loadDB();
  const backup = { id: Date.now().toString(), ...body, createdAt: new Date().toISOString(), size: '42 MB' };
  db.backups.push(backup);
  saveDB(db);
  return c.json(backup);
});

app.get('/api/settings', (c) => {
  const db = loadDB();
  return c.json(db.settings);
});

app.post('/api/console/command', async (c) => {
  const { serverId, command } = await c.req.json();
  return c.json({ serverId, command, output: `Executed: ${command}\n[OK] Command processed` });
});

const port = 3001;
console.log(`KS Panel server running on http://localhost:${port}`);
export default app;