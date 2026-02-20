"use client";

import { useEffect, useState, useCallback } from "react";

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

  const refresh = useCallback(async () => {
    try {
      // Guest token is sent automatically via httpOnly cookie
      const res = await fetch(`/api/rooms/${roomId}/queue`);
      if (res.ok) setQueue(await res.json());
    } catch {} finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { queue, loading, refresh };
}
