import express from 'express';
import { createServer } from 'http';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import cors from 'cors';
import config from './config';
import { AppContext } from './services/AppContext';
import { createApiRouter } from './api/routes';
import { WebSocketManager } from './api/websocket';

// Ensure data directory exists
if (!existsSync(config.databasePath)) {
  const dir = path.dirname(config.databasePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// Initialize application context (database, providers, agent engine wiring)
const appContext = new AppContext();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routes (JSON API for all client actions)
app.use('/api', createApiRouter(appContext));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'KS AGENT Server', version: '1.0.0' });
});

// Serve static frontend if built
const webDist = path.resolve(__dirname, '..', '..', 'web', 'dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

const server = createServer(app);
const wsManager = new WebSocketManager(server, appContext);

server.listen(config.port, config.host, () => {
  console.log(`KS AGENT server listening on http://localhost:${config.port}`);
  console.log(`Database: ${config.databasePath}`);
  if (config.nvidiaApiKey) {
    console.log('NVIDIA API key: configured');
  } else {
    console.log('NVIDIA API key: NOT configured (set NVIDIA_API_KEY env var)');
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  wsManager.close();
  appContext.db.close();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  wsManager.close();
  appContext.db.close();
  server.close(() => process.exit(0));
});