import { useEffect, useRef, useState, useCallback } from 'react';
import { WSEvent } from '../types/api';

export function useWebSocket(): {
  connected: boolean;
  lastEvent: WSEvent | null;
  eventLog: WSEvent[];
} {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null);
  const [eventLog, setEventLog] = useState<WSEvent[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventLogRef = useRef<WSEvent[]>([]);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      setConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastEvent(data);
        const log = [...eventLogRef.current.slice(-199), data];
        eventLogRef.current = log;
        setEventLog(log);
      } catch {
        // ignore
      }
    };

    socket.onclose = () => {
      setConnected(false);
      // Reconnect after 2 seconds
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    socket.onerror = () => {
      socket.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      socketRef.current?.close();
    };
  }, [connect]);

  return { connected, lastEvent, eventLog };
}

export type { WSEvent };