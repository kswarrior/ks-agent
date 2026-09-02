/**
 * Minecraft Server Management Panel - Backend API
 * A mock server that simulates Minecraft server management.
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { randomUUID } from 'crypto';

// In-memory data store (simulates a Minecraft server)
interface ServerInfo {
  name: string;
  version: string;
  motd: string;
  maxPlayers: number;
  onlinePlayers: number;
  tps: number;
  uptime: string;
  memoryUsed: string;
  memoryMax: string;
  isRunning: boolean;
}

interface Player {
  id: number;
  uuid: string;
  name: string;
  ping: number;
  mode: 'survival' | 'creative' | 'spectator';
  isOnCooldown: boolean;
  level: number;
  exp: number;
}

interface ConsoleLog {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
}

interface FileNode {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  children?: FileNode[];
}

interface BackupInfo {
  name: string;
  timestamp: string;
  size: string;
}

const serverStore = {
  serverInfo: {
    name: 'Minecraft Server',
    version: '1.20.1',
    motd: 'Welcome to the Minecraft server!',
    maxPlayers: 20,
    onlinePlayers: 0,
    tps: 20,
    uptime: '0 days 0 hours',
    memoryUsed: '0.5 GB',
    memoryMax: '4 GB',
    isRunning: false,
  },
  
  players: [
    { id: 1, uuid: '11111111-1111-1111-1111-111111111111', name: 'Player1', mode: 'survival', ping: 50, isOnCooldown: false, level: 15, exp: 856 },
  ],
  
  consoleLogs: [] as ConsoleLog[],
  
  files: [
    { name: 'server', type: 'directory' as const },
    { name: 'world', type: 'directory' as const, children: [
      { name: 'level.dat', type: 'file' as const, size: 12456 },
      { name: 'region', type: 'directory' as const },
    ]},
    { name: 'plugins', type: 'directory' as const, children: [] },
    { name: 'logs', type: 'directory' as const, children: [] },
    { name: 'server.properties', type: 'file' as const, size: 2345 },
    { name: 'ops.json', type: 'file' as const, size: 567 },
    { name: 'white-list.json', type: 'file' as const, size: 432 },
  ],
  
  backups: [
    { name: 'backup-2024-01-15.zip', timestamp: '2024-01-15 14:30:00', size: '125 MB' },
    { name: 'backup-2024-01-10.zip', timestamp: '2024-01-10 10:15:00', size: '122 MB' },
  ],
};

// Generate mock console logs
const CONSOLE_LEVELS = ['INFO', 'WARN', 'ERROR', 'DEBUG'] as const;
const mockConsoleMessages = [
  'Server started',
  'Loading level: world',
  'Done (15.234s)! Ready to play!',
  '[Player1< Taylor> hi there',
  '[Server] Player1 logged in',
  'Chunk Loading: 12 chunks',
];

for (let i = 0; i < 50; i++) {
  serverStore.consoleLogs.push({
    timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString().slice(0, 19).replace('T', ' '),
    level: CONSOLE_LEVELS[Math.floor(Math.random() * CONSOLE_LEVELS.length)],
    message: mockConsoleMessages[Math.floor(Math.random() * mockConsoleMessages.length)],
  });
}

// Create Hono app
const app = new Hono();

// Routes

app.get('/api/server', (c) => {
  return c.json({ data: serverStore.serverInfo });
});

app.get('/api/players', (c) => {
  return c.json({ data: serverStore.players });
});

app.get('/api/console', (c) => {
  return c.json({ data: serverStore.consoleLogs });
});

app.get('/api/files', (c) => {
  return c.json({ data: serverStore.files });
});

app.get('/api/backups', (c) => {
  return c.json({ data: serverStore.backups });
});

app.post('/api/server/start', (c) => {
  serverStore.serverInfo.isRunning = true;
  serverStore.serverInfo.onlinePlayers = Math.floor(Math.random() * 10) + 1;
  serverStore.consoleLogs.unshift({
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    level: 'INFO',
    message: 'Server started by admin',
  });
  return c.json({ data: { success: true, message: 'Server started', server: serverStore.serverInfo } });
});

app.post('/api/server/stop', (c) => {
  serverStore.serverInfo.isRunning = false;
  serverStore.serverInfo.onlinePlayers = 0;
  serverStore.consoleLogs.unshift({
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    level: 'INFO',
    message: 'Server stopped by admin',
  });
  return c.json({ data: { success: true, message: 'Server stopped', server: serverStore.serverInfo } });
});

app.post('/api/console/command', async (c) => {
  const { command } = await c.req.json();
  
  const logEntry: ConsoleLog = {
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    level: 'INFO',
    message: `[/] ${command}`,
  };
  
  serverStore.consoleLogs.unshift(logEntry);
  
  // Keep only last 100 logs
  if (serverStore.consoleLogs.length > 100) {
    serverStore.consoleLogs.splice(100);
  }
  
  // Simulate player joining if command is /join
  if (command.toLowerCase().startsWith('/join')) {
    const playerName = command.split(' ')[1] || 'Anonymous';
    const newPlayer: Player = {
      id: Date.now(),
      uuid: randomUUID(),
      name: playerName,
      mode: 'survival',
      ping: 50,
      isOnCooldown: false,
      level: Math.floor(Math.random() * 30) + 1,
      exp: Math.floor(Math.random() * 1000),
    };
    serverStore.players.unshift(newPlayer);
    serverStore.serverInfo.onlinePlayers = Math.min(serverStore.serverInfo.maxPlayers, serverStore.serverInfo.onlinePlayers + 1);
  }
  
  return c.json({ success: true, message: 'Command sent' });
});

app.post('/api/players/:playerId/kick', (c) => {
  const playerId = Number(c.req.param('playerId'));
  const playerIndex = serverStore.players.findIndex(p => p.id === playerId);
  
  if (playerIndex === -1) {
    return c.json({ success: false, message: 'Player not found' }, 404);
  }
  
  const kickedPlayer = serverStore.players.splice(playerIndex, 1)[0];
  serverStore.serverInfo.onlinePlayers = Math.max(0, serverStore.serverInfo.onlinePlayers - 1);
  
  return c.json({ success: true, message: `Player ${kickedPlayer.name} kicked` });
});

app.post('/api/backups/create', (c) => {
  const backupName = `backup-${new Date().toISOString().slice(0, 10)}.zip`;
  const backupSize = `${Math.floor(Math.random() * 200 + 100)} MB`;
  
  const newBackup: BackupInfo = {
    name: backupName,
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    size: backupSize,
  };
  
  serverStore.backups.unshift(newBackup);
  
  return c.json({ success: true, backup: newBackup });
});

app.delete('/api/backups/:backupName', (c) => {
  const backupName = c.req.param('backupName');
  const backupIndex = serverStore.backups.findIndex(b => b.name === backupName);
  
  if (backupIndex === -1) {
    return c.json({ success: false, message: 'Backup not found' }, 404);
  }
  
  const removed = serverStore.backups.splice(backupIndex, 1)[0];
  return c.json({ success: true, message: `Backup ${removed.name} deleted` });
});

app.get('/api/files/download/:filePath', (c) => {
  const filePath = c.req.param('filePath');
  return c.json({ content: `Mock content for ${filePath}` });
});

// Export for Vercel/Node.js
export default app;

// Start server if run directly (works with tsx and node --loader ts-node/esm)
if (process.argv[1] && process.argv[1].endsWith('index.ts')) {
  serve(app, () => {
    console.log('🎮 Minecraft Panel server running on http://localhost:5174');
  });
}