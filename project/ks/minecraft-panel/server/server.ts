/**
 * Minecraft Server Management Panel - Backend API
 * 
 * This is a mock server that simulates Minecraft server management.
 * In a real implementation, this would connect to an actual Minecraft server.
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { randomUUID } from 'crypto';

// In-memory data store (in production, this would be a database)
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
    { id: 1, uuid: '11111111-1111-1111-1111-111111111111', name: 'Player1', mode: 'survival', isOnCooldown: false, level: 15, exp: 856 },
  ],
  
  consoleLogs: [],
  
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

// Mock console logs
const CONSOLE_LEVELS = ['INFO', 'WARN', 'ERROR', 'DEBUG'] as const;
const mockConsoleMessages = [
  'Server started',
  'Loading level: world',
  'Done (15.234s)! Ready to play!',
  '[Player1< Taylor> hi there',
  '[Server] Player1 logged in',
  'Chunk Loading: 12 chunks',
];

// Generate mock console logs
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

// Server info endpoint
app.get('/api/server', (c) => {
  return c.json({ data: serverStore.serverInfo });
});

// Players endpoint
app.get('/api/players', (c) => {
  return c.json({ data: serverStore.players });
});

// Console logs endpoint
app.get('/api/console', (c) => {
  return c.json({ data: serverStore.consoleLogs });
});

// Files endpoint
app.get('/api/files', (c) => {
  return c.json({ data: serverStore.files });
});

// Backups endpoint
app.get('/api/backups', (c) => {
  return c.json({ data: serverStore.backups });
});

// Start/stop server endpoint
app.post('/api/server/start', (c) => {
  serverStore.serverInfo.isRunning = true;
  serverStore.serverInfo.onlinePlayers = Math.floor(Math.random() * 10) + 1;
  return c.json({ data: { success: true, message: 'Server started', server: serverStore.serverInfo } });
});

app.post('/api/server/stop', (c) => {
  serverStore.serverInfo.isRunning = false;
  serverStore.serverInfo.onlinePlayers = 0;
  return c.json({ data: { success: true, message: 'Server stopped', server: serverStore.serverInfo } });
});

// Send command to console
app.post('/api/console/command', async (c) => {
  const { command } = await c.req.json();
  
  const logEntry = {
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    level: 'INFO' as const,
    message: `[/] ${command}`,
  };
  
  serverStore.consoleLogs.unshift(logEntry);
  
  // Keep only last 100 logs
  if (serverStore.consoleLogs.length > 100) {
    serverStore.serverStore.consoleLogs = serverStore.serverLogs.slice(0, 100);
  }
  
  // Simulate player joining if command is /join
  if (command.toLowerCase().startsWith('/join')) {
    const playerName = command.split(' ')[1] || 'Anonymous';
    const newPlayer = {
      id: Date.now(),
      uuid: randomUUID(),
      name: playerName,
      mode: 'survival' as const,
      isOnCooldown: false,
      level: Math.floor(Math.random() * 30) + 1,
      exp: Math.floor(Math.random() * 1000),
    };
    serverStore.players.unshift(newPlayer);
    serverStore.serverInfo.onlinePlayers = Math.min(serverStore.serverInfo.maxPlayers, serverStore.serverInfo.onlinePlayers + 1);
  }
  
  return c.json({ data: { success: true, message: 'Command sent' } });
});

// Player specific endpoints
app.post('/api/players/:playerId/kick', (c) => {
  const playerId = Number(c.req.param('playerId'));
  const playerIndex = serverStore.players.findIndex(p => p.id === playerId);
  
  if (playerIndex === -1) {
    return c.json({ data: { success: false, message: 'Player not found' } }, 404);
  }
  
  serverStore.players.splice(playerIndex, 1);
  serverStore.serverInfo.onlinePlayers = Math.max(0, serverStore.serverInfo.onlinePlayers - 1);
  
  return c.json({ data: { success: true, message: 'Player kicked' } });
});

// Backup endpoints
app.post('/api/backups/create', (c) => {
  const backupName = `backup-${new Date().toISOString().slice(0, 10)}.zip`;
  const backupSize = `${Math.floor(Math.random() * 200 + 100)} MB`;
  
  const newBackup = {
    name: backupName,
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    size: backupSize,
  };
  
  serverStore.backups.unshift(newBackup);
  
  return c.json({ data: { success: true, backup: newBackup } });
});

app.delete('/api/backups/:backupName', (c) => {
  const backupName = c.req.param('backupName');
  const backupIndex = serverStore.backups.findIndex(b => b.name === backupName);
  
  if (backupIndex === -1) {
    return c.json({ data: { success: false, message: 'Backup not found' } }, 404);
  }
  
  const removed = serverStore.backups.splice(backupIndex, 1)[0];
  
  return c.json({ data: { success: true, message: `Backup ${removed.name} deleted` } });
});

// File operations
app.get('/api/files/download/:filePath', (c) => {
  const filePath = c.req.param('filePath');
  // In a real implementation, this would read and return the file
  return c.json({ data: { content: `Mock content for ${filePath}` } });
});

// Export app for Vercel/Node.js
export default app;

// Start server if run directly
if (import.meta.main) {
  serve(app, () => {
    console.log('🎮 Minecraft Panel server running on http://localhost:3000');
  });
}