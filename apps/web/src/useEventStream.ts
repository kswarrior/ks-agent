import { useEffect, useRef, useState } from 'react';

export interface SSEState {
  connected: boolean;
  events: any[];
}

export function useEventStream(): SSEState {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const seenRef = useRef(0);

  useEffect(() => {
    const source = new EventSource('/api/events');
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        seenRef.current += 1;
        setEvents((prev) => {
          const next = [...prev, data];
          if (next.length > 500) return next.slice(-500);
          return next;
        });
      } catch {
        // ignore
      }
    };
    return () => {
      source.close();
    };
  }, []);

  return { connected, events };
}
