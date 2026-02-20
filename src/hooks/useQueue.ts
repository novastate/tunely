"use client";

import { useEffect, useState, useCallback, useRef } from "react";

export interface QueueItem {
  id: string;
  trackId: string;
  trackName: string;
  artistName: string;
  albumImage: string | null;
  durationMs: number;
  votes: number;
  votedBy: string[];
  addedBy: string;
  addedByName: string;
  addedAt: string;
}

export function useQueue(roomId: string) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomId}/queue`);
      if (res.ok) setQueue(await res.json());
    } catch {} finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    // Initial fetch
    refresh();

    // Try SSE connection
    let sseConnected = false;
    try {
      const es = new EventSource(`/api/rooms/${roomId}/queue/events`);
      eventSourceRef.current = es;

      es.addEventListener("queue-update", () => {
        // On any queue change, refetch the full queue
        refresh();
      });

      es.onopen = () => {
        sseConnected = true;
        // Clear polling fallback if SSE connects
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      };

      es.onerror = () => {
        // SSE failed, fall back to polling
        if (!pollingRef.current) {
          pollingRef.current = setInterval(refresh, 3000);
        }
      };
    } catch {
      // EventSource not supported, use polling
      pollingRef.current = setInterval(refresh, 3000);
    }

    // Start polling as fallback until SSE confirms connection
    if (!sseConnected && !pollingRef.current) {
      pollingRef.current = setInterval(refresh, 3000);
    }

    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [roomId, refresh]);

  return { queue, loading, refresh };
}
