import { Hono } from 'hono';
import { randomUUID } from 'crypto';

const app = new Hono();

// In-memory server state (would be persisted to files in production)
let serverState: {
  running: boolean;
  players: Array<{ id: number; name: string; uuid: string; ping: number; isOnline: boolean }>;
  config: Record<string, any>;
  consoleMessages: Array<{ type: string; content: string; timestamp: number }>;
} = {
  running: false,
  players: [],
  config: {
    name: 'KS Minecraft Server',
    port: 25565,
    maxPlayers: 20,
    onlineMode: true,
    gamemode: 'survival',
    difficulty: 'normal',
    levelName: 'world',
  },
  consoleMessages: [],
};

// Seed some players
for (let i = 0; i < 5; i++) {
  serverState.players.push({
    id: i + 1,
    name: `Player${i + 1}`,
    uuid: randomUUID(),
    ping: Math.floor(Math.random() * 100) + 20,
    isOnline: i % 2 === 0,
  });
}

// Data folder paths
const DATA_FOLDER = './data';
const CONSOLE_FOLDER = 'console';

// Server API routes
app.get('/api/server/status', (c) => {
  const status = {
    running: serverState.running,
    players: serverState.players.filter(p => p.isOnline).length,
    tps: 20.0,
    uptime: 0,
    memory: {
      used: 1024,
      max: 2048,
    },
  };
  return c.json({ status });
});

app.post('/api/server/start', (c) => {
  serverState.running = true;
  serverState.consoleMessages.push({
    type: 'output',
    content: 'Server started',
    timestamp: Date.now(),
  });
  return c.json({ success: true });
});

app.post('/api/server/stop', (c) => {
  serverState.running = false;
  serverState.consoleMessages.push({
    type: 'output',
    content: 'Server stopped',
    timestamp: Date.now(),
  });
  return c.json({ success: true });
});

app.post('/api/server/restart', (c) => {
  serverState.running = false;
  setTimeout(() => {
    serverState.running = true;
    serverState.consoleMessages.push({
      type: 'output',
      content: 'Server restarted',
      timestamp: Date.now(),
    });
  }, 100);
  return c.json({ success: true });
});

app.get('/api/server/config', (c) => {
  return c.json({ config: serverState.config });
});

app.put('/api/server/config', async (c) => {
  const updates = await c.req.json();
  serverState.config = { ...serverState.config, ...updates };
  return c.json({ config: serverState.config });
});

// Players API
app.get('/api/players', (c) => {
  return c.json({ players: serverState.players });
});

app.post('/api/players/:id/kick', (c) => {
  const id = c.req.param('id');
  const player = serverState.players.find(p => p.id === parseInt(id));
  if (player) {
    player.isOnline = false;
    serverState.consoleMessages.push({
      type: 'output',
      content: `${player.name} was kicked`,
      timestamp: Date.now(),
    });
  }
  return c.json({ success: true });
});

app.post('/api/players/:id/ban', (c) => {
  const id = c.req.param('id');
  const player = serverState.players.find(p => p.id === parseInt(id));
  if (player) {
    serverState.players = serverState.players.filter(p => p.id !== player.id);
    serverState.consoleMessages.push({
      type: 'output',
      content: `${player.name} was banned`,
      timestamp: Date.now(),
    });
  }
  return c.json({ success: true });
});

// Files API
app.get('/api/files', (c) => {
  const mockFiles = [
    { name: 'server.properties', type: 'file', path: 'server.properties' },
    { name: 'ops.json', type: 'file', path: 'ops.json' },
    { name: 'whitelist.json', type: 'file', path: 'whitelist.json' },
    { name: 'logs', type: 'directory', path: 'logs' },
    { name: 'plugins', type: 'directory', path: 'plugins' },
    { name: 'world', type: 'directory', path: 'world' },
  ];
  return c.json({ files: mockFiles });
});

app.get('/api/files/read', (c) => {
  const path = c.req.query('path') || '';
  // Mock file content
  const content = `player1=Player1
player2=Player2
${path}`;
  return c.json({ content });
});

app.post('/api/files/write', async (c) => {
  const { path, content } = await c.req.json();
  serverState.consoleMessages.push({
    type: 'output',
    content: `File written: ${path}`,
    timestamp: Date.now(),
  });
  return c.json({ success: true });
});

app.post('/api/files/delete', async (c) => {
  const { path } = await c.req.json();
  serverState.consoleMessages.push({
    type: 'output',
    content: `File deleted: ${path}`,
    timestamp: Date.now(),
  });
  return c.json({ success: true });
});

// Console API
app.get('/api/console/messages', (c) => {
  return c.json({ messages: serverState.consoleMessages });
});

app.post('/api/console/command', async (c) => {
  const { command } = await c.req.json();
  serverState.consoleMessages.push({
    type: 'input',
    content: command,
    timestamp: Date.now(),
  });
  serverState.consoleMessages.push({
    type: 'output',
    content: `Executed: ${command}`,
    timestamp: Date.now(),
  });
  return c.json({ success: true });
});

app.get('/api/console/events', (c) => {
  const eventStream = new Response('', {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });

  const interval = setInterval(() => {
    const message = serverState.consoleMessages[serverState.consoleMessages.length - 1];
    if (message) {
      eventStream.write(`data: ${JSON.stringify(message)}\n\n`);
    }
  }, 1000);

  eventStream.on('close', () => clearInterval(interval));

  return eventStream;
});

export default app;