import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';

const app = new Hono();

// Data paths
const DATA_DIR = process.env.DATA_DIR || './data';
const CONFIG_PATH = join(DATA_DIR, 'config.json');
const PLAYERS_PATH = join(DATA_DIR, 'players.json');
const CONSOLE_PATH = join(DATA_DIR, 'console');
const FILES_DIR = join(DATA_DIR, 'files');

// Ensure directories exist
async function ensureDirs() {
  await fs.mkdir(CONSOLE_PATH, { recursive: true });
  await fs.mkdir(FILES_DIR, { recursive: true });
}

// Server state
let serverState: {
  running: boolean;
  config: any;
} = {
  running: false,
  config: {},
};

// Load or initialize config
async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8');
    serverState.config = JSON.parse(data);
  } catch {
    serverState.config = {
      name: 'KS Minecraft Server',
      port: 25565,
      maxPlayers: 20,
      onlineMode: true,
      gamemode: 'survival',
      difficulty: 'normal',
      levelName: 'world',
    };
    await saveConfig();
  }
}

async function saveConfig() {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(serverState.config, null, 2));
}

// Player management
interface Player {
  id: number;
  name: string;
  uuid: string;
  ping: number;
  isOnline: boolean;
}

let players: Player[] = [];

async function loadPlayers() {
  try {
    const data = await fs.readFile(PLAYERS_PATH, 'utf-8');
    players = JSON.parse(data);
  } catch {
    players = [
      { id: 1, name: 'Player1', uuid: randomUUID(), ping: 45, isOnline: true },
      { id: 2, name: 'Player2', uuid: randomUUID(), ping: 32, isOnline: true },
      { id: 3, name: 'Player3', uuid: randomUUID(), ping: 78, isOnline: false },
      { id: 4, name: 'Player4', uuid: randomUUID(), ping: 25, isOnline: true },
      { id: 5, name: 'Player5', uuid: randomUUID(), ping: 56, isOnline: false },
    ];
    await savePlayers();
  }
}

async function savePlayers() {
  await fs.writeFile(PLAYERS_PATH, JSON.stringify(players, null, 2));
}

// Console message interface
interface ConsoleMessage {
  type: 'input' | 'output';
  content: string;
  timestamp: number;
}

// Get console history
async function getConsoleHistory(): Promise<ConsoleMessage[]> {
  try {
    const files = await fs.readdir(CONSOLE_PATH);
    const messages: ConsoleMessage[] = [];
    
    for (const file of files) {
      const content = await fs.readFile(join(CONSOLE_PATH, file), 'utf-8');
      try {
        const lines = JSON.parse(content);
        messages.push(...lines);
      } catch {
        for (const line of content.split('\n').filter(Boolean)) {
          messages.push({ type: 'output', content: line, timestamp: Date.now() });
        }
      }
    }
    
    return messages.sort((a, b) => a.timestamp - b.timestamp);
  } catch {
    return [];
  }
}

// File system API
async function listFiles(path = ''): Promise<any[]> {
  const fullPath = join(FILES_DIR, path);
  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    return entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      path: join(path, entry.name),
    }));
  } catch {
    return [];
  }
}

// Initialize
async function init() {
  await ensureDirs();
  await loadConfig();
  await loadPlayers();
  
  // Reset player statuses each query (simulating live data)
  for (const player of players) {
    player.isOnline = Math.random() > 0.3;
    player.ping = Math.floor(Math.random() * 100) + 20;
  }
}

// API Routes

// Server status
app.get('/api/server/status', (c) => {
  const status = {
    running: serverState.running,
    players: players.filter(p => p.isOnline).length,
    tps: 20.0,
    uptime: 0,
    memory: { used: 1024, max: 2048 },
  };
  return c.json({ status });
});

// Server control
app.post('/api/server/start', async (c) => {
  serverState.running = true;
  const msg: ConsoleMessage = {
    type: 'output',
    content: 'Server started',
    timestamp: Date.now(),
  };
  await fs.appendFile(join(CONSOLE_PATH, Date.now() + '.json'), JSON.stringify([msg]));
  return c.json({ success: true });
});

app.post('/api/server/stop', async (c) => {
  serverState.running = false;
  const msg: ConsoleMessage = {
    type: 'output',
    content: 'Server stopped',
    timestamp: Date.now(),
  };
  await fs.appendFile(join(CONSOLE_PATH, Date.now() + '.json'), JSON.stringify([msg]));
  return c.json({ success: true });
});

app.post('/api/server/restart', async (c) => {
  serverState.running = false;
  const msg1: ConsoleMessage = {
    type: 'output',
    content: 'Server restarting...',
    timestamp: Date.now(),
  };
  await fs.appendFile(join(CONSOLE_PATH, Date.now() + '.json'), JSON.stringify([msg1]));
  
  setTimeout(async () => {
    serverState.running = true;
    const msg2: ConsoleMessage = {
      type: 'output',
      content: 'Server restarted',
      timestamp: Date.now(),
    };
    await fs.appendFile(join(CONSOLE_PATH, Date.now() + '.json'), JSON.stringify([msg2]));
  }, 100);
  
  return c.json({ success: true });
});

// Server config
app.get('/api/server/config', (c) => {
  return c.json({ config: serverState.config });
});

app.put('/api/server/config', async (c) => {
  const updates = await c.req.json();
  serverState.config = { ...serverState.config, ...updates };
  await saveConfig();
  return c.json({ config: serverState.config });
});

// Players
app.get('/api/players', (c) => {
  return c.json({ players });
});

app.post('/api/players/:id/kick', async (c) => {
  const id = parseInt(c.req.param('id'));
  const player = players.find(p => p.id === id);
  if (player) {
    player.isOnline = false;
    const msg: ConsoleMessage = {
      type: 'output',
      content: `${player.name} was kicked`,
      timestamp: Date.now(),
    };
    await fs.appendFile(join(CONSOLE_PATH, Date.now() + '.json'), JSON.stringify([msg]));
  }
  return c.json({ success: true });
});

app.post('/api/players/:id/ban', async (c) => {
  const id = parseInt(c.req.param('id'));
  const player = players.find(p => p.id === id);
  if (player) {
    players = players.filter(p => p.id !== id);
    await savePlayers();
    const msg: ConsoleMessage = {
      type: 'output',
      content: `${player.name} was banned`,
      timestamp: Date.now(),
    };
    await fs.appendFile(join(CONSOLE_PATH, Date.now() + '.json'), JSON.stringify([msg]));
  }
  return c.json({ success: true });
});

// Files
app.get('/api/files', async (c) => {
  const path = c.req.query('path') || '';
  const files = await listFiles(path);
  return c.json({ files });
});

app.get('/api/files/read', async (c) => {
  const path = c.req.query('path');
  if (!path) return c.json({ content: '' });
  
  const fullPath = join(FILES_DIR, path);
  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    return c.json({ content });
  } catch {
    return c.json({ content: '' });
  }
});

app.post('/api/files/write', async (c) => {
  const { path, content } = await c.req.json();
  if (!path) return c.json({ success: false, error: 'No path provided' });
  
  const fullPath = join(FILES_DIR, path);
  await fs.writeFile(fullPath, content);
  
  const msg: ConsoleMessage = {
    type: 'output',
    content: `File written: ${path}`,
    timestamp: Date.now(),
  };
  await fs.appendFile(join(CONSOLE_PATH, Date.now() + '.json'), JSON.stringify([msg]));
  
  return c.json({ success: true });
});

app.post('/api/files/delete', async (c) => {
  const { path } = await c.req.json();
  if (!path) return c.json({ success: false, error: 'No path provided' });
  
  const fullPath = join(FILES_DIR, path);
  await fs.rm(fullPath);
  
  const msg: ConsoleMessage = {
    type: 'output',
    content: `File deleted: ${path}`,
    timestamp: Date.now(),
  };
  await fs.appendFile(join(CONSOLE_PATH, Date.now() + '.json'), JSON.stringify([msg]));
  
  return c.json({ success: true });
});

// Console
app.get('/api/console/messages', async (c) => {
  const messages = await getConsoleHistory();
  return c.json({ messages });
});

app.post('/api/console/command', async (c) => {
  const { command } = await c.req.json();
  const msg: ConsoleMessage = {
    type: 'input',
    content: command,
    timestamp: Date.now(),
  };
  const output: ConsoleMessage = {
    type: 'output',
    content: `Executed: ${command}`,
    timestamp: Date.now(),
  };
  
  await fs.appendFile(join(CONSOLE_PATH, Date.now() + '.json'), JSON.stringify([msg, output]));
  
  return c.json({ success: true });
});

// SSE for console streaming
app.get('/api/console/events', (c) => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      
      // Send initial message
      const initial = `data: ${JSON.stringify({ type: 'output', content: 'Console connected', timestamp: Date.now() })}\n\n`;
      controller.enqueue(encoder.encode(initial));
      
      // Send a welcome message
      const welcome = `data: ${JSON.stringify({ type: 'output', content: 'Welcome to KS Minecraft Server Console', timestamp: Date.now() })}\n\n`;
      controller.enqueue(encoder.encode(welcome));
    },
    
    cancel() {
      // Cleanup on client disconnect
    }
  });
  
  return c.body(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok' });
});

// Start server
export default app;

init().catch(console.error);