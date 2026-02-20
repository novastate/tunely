/**
 * Server-Sent Events (SSE) hub for real-time queue updates.
 * Replaces 3-second polling with push-based updates.
 */

type Listener = (data: string) => void;

class QueueEventHub {
  private rooms = new Map<string, Set<Listener>>();

  subscribe(roomId: string, listener: Listener): () => void {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    this.rooms.get(roomId)!.add(listener);

    return () => {
      const listeners = this.rooms.get(roomId);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) this.rooms.delete(roomId);
      }
    };
  }

  notify(roomId: string, event: string, data?: unknown) {
    const listeners = this.rooms.get(roomId);
    if (!listeners || listeners.size === 0) return;

    const payload = `event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`;
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch {
        // Listener errored, will be cleaned up on disconnect
      }
    }
  }

  getConnectionCount(roomId: string): number {
    return this.rooms.get(roomId)?.size ?? 0;
  }
}

export const queueEvents = new QueueEventHub();
