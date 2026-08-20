import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { AppContext } from '../services/AppContext';

interface Client {
  socket: WebSocket;
}

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private appContext: AppContext;

  constructor(server: Server, appContext: AppContext) {
    this.appContext = appContext;
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (socket) => {
      this.clients.add(socket);
      socket.send(JSON.stringify({ type: 'connected', data: { ok: true }, timestamp: new Date().toISOString() }));

      socket.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(socket, msg);
        } catch {
          socket.send(JSON.stringify({ type: 'error', data: { message: 'Invalid message format' } }));
        }
      });

      socket.on('close', () => {
        this.clients.delete(socket);
      });
    });

    // Forward agent events to all connected clients
    this.appContext.eventBus.on('agent_event', (payload) => {
      const message = JSON.stringify({ ...payload });
      this.broadcast(message);
    });
  }

  private handleMessage(socket: WebSocket, msg: { type?: string; data?: unknown }): void {
    switch (msg.type) {
      case 'ping':
        socket.send(JSON.stringify({ type: 'pong', data: {}, timestamp: new Date().toISOString() }));
        break;
      case 'subscribe':
        // All clients receive all events for simplicity in v1
        socket.send(JSON.stringify({ type: 'subscribed', data: {}, timestamp: new Date().toISOString() }));
        break;
      default:
        socket.send(JSON.stringify({ type: 'error', data: { message: `Unknown message type: ${msg.type}` } }));
    }
  }

  broadcast(message: string): void {
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  close(): void {
    this.wss.close();
  }
}