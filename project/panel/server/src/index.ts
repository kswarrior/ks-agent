import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { readFileSync, writeFileSync, statSync, readdirSync, mkdirSync, rmSync, existsSync, openSync, appendFileSync, constants } from 'fs';
import { join, dirname } from 'path';
import { spawn, spawnSync } from 'child_process';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

// Use the WebSocket from ws package
declare module 'ws' {
  interface WebSocket {
    readyState: number;
    send(data: any): void;
    close(): void;
    on(event: string, callback: Function): void;
    off(event: string, callback: Function): void;
  }
}

const app = new Hono();

// Configuration
const SERVER_ROOT = process.env.SERVER_ROOT || join(process.cwd(), 'server-files');
const SERVER_STATUS_FILE = join(SERVER_ROOT, 'status.json');
const SERVER_LOGS_DIR = join(SERVER_ROOT, 'logs');

// In-memory state for server process and WebSocket connections
let serverProcess: any = null;
let wss: WebSocketServer | null = null;

// WebSocket connections for console streaming
const clients = new Set<any>();

app.use('*', cors({
  origin: ['http://localhost:5173'],
  allowMethods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Helper to ensure server files exist
function ensureServerRoot() {
  if (!existsSync(SERVER_ROOT)) {
    mkdirSync(SERVER_ROOT, { recursive: true });
    console.log(`Created server root: ${SERVER_ROOT}`);
  }
}

// Helper to get server status
function getServerStatus() {
  try {
    if (existsSync(SERVER_STATUS_FILE)) {
      const data = readFileSync(SERVER_STATUS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error reading status file:', e);
  }
  return {
    running: false,
    players: 0,
    maxPlayers: 20,
    uptime: 0,
    tps: 20,
    memory: { used: 0, max: 0 },
    startedAt: null
  };
}

// Helper to write server status
function writeServerStatus(status: any) {
  try {
    ensureServerRoot();
    writeFileSync(SERVER_STATUS_FILE, JSON.stringify(status, null, 2));
  } catch (e) {
    console.error('Error writing status file:', e);
  }
}

// Broadcast console message to all clients
function broadcastConsoleMessage(message: string) {
  clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type: 'console', data: message }));
    }
  });
}

// Initialize WebSocket server
function initWebSocket() {
  if (!wss) {
    wss = new WebSocketServer({ noProxy: true });
    wss.on('connection', (ws: any) => {
      console.log('Client connected to console');
      clients.add(ws);
      
      ws.on('close', () => {
        console.log('Client disconnected from console');
        clients.delete(ws);
      });
      
      ws.on('message', (data: Buffer) => {
        // Handle console commands
        const cmd = data.toString().trim();
        if (serverProcess && serverProcess.stdin) {
          serverProcess.stdin.write(cmd + '\n');
        }
      });
    });
  }
}

// Server Management Endpoints

// GET /api/status - Get server status
app.get('/api/status', (c) => {
  return c.json(getServerStatus());
});

// POST /api/start - Start the server
app.post('/api/start', (c) => {
  ensureServerRoot();
  
  const status = getServerStatus();
  if (status.running) {
    return c.json({ error: 'Server is already running' }, 400);
  }

  // Check if startup script exists
  const startupScript = join(SERVER_ROOT, 'start.sh');
  const serverJar = join(SERVER_ROOT, 'server.jar');
  
  if (existsSync(startupScript)) {
    // Use startup script if exists
    serverProcess = spawn('bash', [startupScript], {
      cwd: SERVER_ROOT,
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } else if (existsSync(serverJar)) {
    // Auto-launch server jar directly
    serverProcess = spawn('java', [
      '-Xmx1024M',
      '-Xms1024M',
      '-jar',
      'server.jar',
      'nogui'
    ], {
      cwd: SERVER_ROOT,
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } else {
    return c.json({ 
      error: 'No server files found. Please place server.jar in the server directory.',
      serverDir: SERVER_ROOT 
    }, 404);
  }

  if (serverProcess) {
    serverProcess.stdout.on('data', (data: Buffer) => {
      const msg = data.toString();
      broadcastConsoleMessage(msg);
      // Also write to log file
      try {
        appendFileSync(join(SERVER_LOGS_DIR, 'latest.log'), msg);
      } catch (e) {
        console.error('Failed to write log:', e);
      }
    });

    serverProcess.stderr.on('data', (data: Buffer) => {
      const msg = data.toString();
      broadcastConsoleMessage(msg);
    });

    serverProcess.on('exit', (code: number) => {
      console.log(`Server process exited with code ${code}`);
      const currentStatus = getServerStatus();
      currentStatus.running = false;
      writeServerStatus(currentStatus);
    });
  }

  const newStatus = getServerStatus();
  newStatus.running = true;
  newStatus.startedAt = new Date().toISOString();
  writeServerStatus(newStatus);

  return c.json({ message: 'Server starting...', running: true });
});

// POST /api/stop - Stop the server
app.post('/api/stop', (c) => {
  if (!serverProcess) {
    return c.json({ error: 'Server is not running' }, 400);
  }

  serverProcess.kill();
  serverProcess = null;

  const currentStatus = getServerStatus();
  currentStatus.running = false;
  writeServerStatus(currentStatus);

  return c.json({ message: 'Server stopping...' });
});

// GET /api/console - WebSocket endpoint for console streaming
app.get('/api/console', (c) => {
  const upgrade = c.req.headers.get('upgrade');
  if (upgrade !== 'websocket') {
    return c.text('WebSocket required', 400);
  }
  
  initWebSocket();
  
  // Return dynamic response for Hono
  const response = c.text('');
  return response;
});

// File Management Endpoints

// GET /api/files - List files in server directory
app.get('/api/files', (c) => {
  ensureServerRoot();
  const path = c.req.query('path') || '';
  const fullPath = join(SERVER_ROOT, path);
  
  if (!existsSync(fullPath)) {
    return c.json({ error: 'Directory not found' }, 404);
  }
  
  try {
    const files = readdirSync(fullPath);
    const result = files.map(file => {
      const filePath = join(fullPath, file);
      const fileStat = statSync(filePath);
      return {
        name: file,
        path: join(path, file).replace(/^\/+/, ''),
        type: fileStat.isDirectory() ? 'directory' : 'file',
        size: fileStat.size,
        modified: fileStat.mtime.toISOString()
      };
    });
    return c.json(result);
  } catch (e) {
    return c.json({ error: 'Failed to list files' }, 500);
  }
});

// GET /api/files/:path - Read file contents
app.get('/api/files/:path', (c) => {
  const filePath = join(SERVER_ROOT, c.req.param('path'));
  
  try {
    if (!existsSync(filePath)) {
      return c.json({ error: 'File not found' }, 404);
    }
    
    const fileStat = statSync(filePath);
    if (fileStat.isDirectory()) {
      return c.json({ error: 'Cannot read directory' }, 400);
    }
    
    const content = readFileSync(filePath, 'utf-8');
    return c.json({ path: c.req.param('path'), content });
  } catch (e) {
    return c.json({ error: 'Failed to read file' }, 500);
  }
});

// POST /api/files - Create/edit file
app.post('/api/files', async (c) => {
  try {
    const body = await c.req.json();
    const { path, content } = body as { path: string; content: string };
    const fullPath = join(SERVER_ROOT, path);
    const dir = dirname(fullPath);
    
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    writeFileSync(fullPath, content);
    return c.json({ message: 'File saved', path });
  } catch (e) {
    return c.json({ error: 'Failed to save file' }, 500);
  }
});

// DELETE /api/files/:path - Delete file
app.delete('/api/files/:path', (c) => {
  const filePath = join(SERVER_ROOT, c.req.param('path'));
  
  try {
    if (!existsSync(filePath)) {
      return c.json({ error: 'File not found' }, 404);
    }
    
    rmSync(filePath);
    return c.json({ message: 'File deleted' });
  } catch (e) {
    return c.json({ error: 'Failed to delete file' }, 500);
  }
});

// GET /api/logs - Get server logs list
app.get('/api/logs', (c) => {
  ensureServerRoot();
  
  if (!existsSync(SERVER_LOGS_DIR)) {
    mkdirSync(SERVER_LOGS_DIR, { recursive: true });
  }
  
  try {
    const logs = readdirSync(SERVER_LOGS_DIR)
      .filter(f => f.endsWith('.log'))
      .sort()
      .reverse();
    
    return c.json({ logs });
  } catch (e) {
    return c.json({ error: 'Failed to read logs' }, 500);
  }
});

// GET /api/logs/:name - Read specific log file
app.get('/api/logs/:name', (c) => {
  const logPath = join(SERVER_LOGS_DIR, c.req.param('name'));
  
  try {
    if (!existsSync(logPath)) {
      return c.json({ error: 'Log file not found' }, 404);
    }
    
    const content = readFileSync(logPath, 'utf-8');
    return c.json({ name: c.req.param('name'), content });
  } catch (e) {
    return c.json({ error: 'Failed to read log file' }, 500);
  }
});

// POST /api/config - Save/server configuration
app.post('/api/config', async (c) => {
  const configPath = join(SERVER_ROOT, 'server.properties');
  
  try {
    const config = await c.req.json();
    
    // Convert JSON config to server.properties format
    let props = '';
    for (const [key, value] of Object.entries(config)) {
      props += `${key}=${value}\n`;
    }
    
    writeFileSync(configPath, props);
    return c.json({ message: 'Configuration saved' });
  } catch (e) {
    return c.json({ error: 'Failed to save configuration' }, 500);
  }
});

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

export { app };