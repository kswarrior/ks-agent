import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import { readFileSync, writeFile, appendFile, stat, readdir, mkdir, rm, existsSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const app = new Hono();

// Configuration
const SERVER_ROOT = process.env.SERVER_ROOT || './server-files';
const SERVER_STATUS_FILE = join(SERVER_ROOT, 'status.json');
const SERVER_LOGS_DIR = join(SERVER_ROOT, 'logs');

// In-memory state for server process
let serverProcess: any = null;
let serverPort = 25565;

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

function mkdirSync(path: string, options: any = {}) {
  const { mkdirSync } = require('fs');
  mkdirSync(path, options);
}

// Helper to get server status
function getServerStatus() {
  try {
    if (existsSync(SERVER_STATUS_FILE)) {
      const data = JSON.parse(readFileSync(SERVER_STATUS_FILE, 'utf-8'));
      return data;
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

// Server Management Endpoints

// GET /api/status - Get server status
app.get('/api/status', (c) => {
  return c.json(getServerStatus());
});

// POST /api/start - Start the server
app.post('/api/start', (c) => {
  ensureServerRoot();
  const { spawn } = require('child_process');
  const { exec } = require('child_process');
  
  const status = getServerStatus();
  if (status.running) {
    return c.json({ error: 'Server is already running' }, 400);
  }

  // Check if startup script exists
  const startupScript = join(SERVER_ROOT, 'start.sh');
  const serverJar = join(SERVER_ROOT, 'server.jar');
  
  if (existsSync(startupScript)) {
    exec(`chmod +x ${startupScript} && ${startupScript}`, { cwd: SERVER_ROOT });
  } else if (existsSync(serverJar)) {
    // Auto-detect Java if no startup script
    serverProcess = spawn('java', ['-Xmx1024M', '-Xms1024M', '-jar', 'server.jar', 'nogui'], {
      cwd: SERVER_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, SERVER_PORT: String(serverPort) }
    });

    serverProcess.stdout.on('data', (data: Buffer) => {
      broadcastConsoleMessage(data.toString());
    });

    serverProcess.stderr.on('data', (data: Buffer) => {
      broadcastConsoleMessage(data.toString());
    });

    serverProcess.on('exit', () => {
      stopConsoleMonitoring();
      const currentStatus = getServerStatus();
      currentStatus.running = false;
      writeServerStatus(currentStatus);
    });
  } else {
    return c.json({ 
      error: 'No server files found. Please place server.jar in the server directory.',
      serverDir: SERVER_ROOT 
    }, 404);
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
    return c.json({ error: 'No server process found' }, 400);
  }

  serverProcess.kill();
  serverProcess = null;

  const currentStatus = getServerStatus();
  currentStatus.running = false;
  writeServerStatus(currentStatus);

  return c.json({ message: 'Server stopping...' });
});

// POST /api/restart - Restart the server
app.post('/api/restart', async (c) => {
  await fetch('http://localhost:3000/api/stop', { method: 'POST' }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
  await fetch('http://localhost:3000/api/start', { method: 'POST' });
  return c.json({ message: 'Server restarting...' });
});

// WebSocket setup for console streaming
let wss: WebSocketServer | null = null;

function initWebSocket() {
  if (!wss) {
    wss = new WebSocketServer({ noProxy: true });
    wss.on('connection', (ws) => {
      console.log('Client connected to console');
      ws.on('close', () => {
        console.log('Client disconnected');
      });
    });
  }
}

// Broadcast console message to all clients
function broadcastConsoleMessage(message: string) {
  if (wss) {
    wss.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: 'console', data: message }));
      }
    });
  }
}

// Stop console monitoring
function stopConsoleMonitoring() {
  if (wss) {
    wss.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: 'status', data: 'disconnected' }));
      }
    });
  }
}

// GET /api/console - WebSocket endpoint for console streaming
app.get('/api/console', (c) => {
  initWebSocket();
  const upgrade = c.req.raw.headers.get('upgrade');
  if (upgrade !== 'websocket') {
    return c.text('WebSocket required', 400);
  }

  const ws = (c as any).env?.ws as WebSocket;
  if (ws) {
    wss?.clients.forEach(client => ws = client);
  }
  
  // For Hono, we need to handle the WebSocket differently
  // This is a simplified version - in production you'd use hono/ws properly
  c.status(400);
  return c.text('Use the WS endpoint directly');
});

// File Management Endpoints

// GET /api/files - List files in server directory
app.get('/api/files', (c) => {
  ensureServerRoot();
  const path = c.req.query.path || '';
  const fullPath = join(SERVER_ROOT, path);
  
  try {
    const files = readdirSync(fullPath);
    const result = files.map(file => {
      const filePath = join(fullPath, file);
      const stat = existsSync(filePath) ? require('fs').statSync(filePath) : null;
      return {
        name: file,
        path: join(path, file).replace(/^\\/, ''),
        type: stat?.isDirectory() ? 'directory' : 'file',
        size: stat?.size || 0,
        modified: stat?.mtime?.toISOString() || null
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
    
    const stat = require('fs').statSync(filePath);
    if (stat.isDirectory()) {
      return c.json({ error: 'Cannot read directory' }, 400);
    }
    
    const content = readFileSync(filePath, 'utf-8');
    return c.json({ path: c.req.param('path'), content });
  } catch (e) {
    return c.json({ error: 'Failed to read file' }, 500);
  }
});

// POST /api/files - Create/edit file
app.post('/api/files', (c) => {
  const body = c.req.body;
  const data = c.req.body;

  return new Promise((resolve) => {
    let rawData = '';
    c.req.on('data', chunk => rawData += chunk);
    c.req.on('end', () => {
      try {
        const body = JSON.parse(rawData);
        const { path, content } = body;
        const fullPath = join(SERVER_ROOT, path);
        const dir = dirname(fullPath);
        
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        
        writeFileSync(fullPath, content);
        resolve(c.json({ message: 'File saved', path }));
      } catch (e) {
        resolve(c.json({ error: 'Failed to save file' }, 500));
      }
    });
  });
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

// GET /api/logs - Get server logs
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

// POST /api/config - Save configuration
app.post('/api/config', (c) => {
  const configPath = join(SERVER_ROOT, 'server.properties');
  
  return new Promise((resolve) => {
    let rawData = '';
    c.req.on('data', chunk => rawData += chunk);
    c.req.on('end', () => {
      try {
        const config = JSON.parse(rawData);
        writeFileSync(configPath, JSON.stringify(config, null, 2));
        resolve(c.json({ message: 'Configuration saved' }));
      } catch (e) {
        resolve(c.json({ error: 'Failed to save configuration' }, 500));
      }
    });
  });
});

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// Type checking
function writeFileSync(path: string, data: string) {
  require('fs').writeFileSync(path, data);
}

const server = {
  port: process.env.PORT || 3000,
  start: () => {
    ensureServerRoot();
    
    // Default status
    if (!existsSync(SERVER_STATUS_FILE)) {
      writeServerStatus(getServerStatus());
    }
    
    console.log(`Minecraft Panel API server starting on port ${server.port}`);
    
    return server;
  }
};

const serve = (options: any) => {
  app.listen(options.port || 3000, () => {
    console.log(`Server listening on http://localhost:${options.port || 3000}`);
  });
};

export { app };