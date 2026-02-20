import { queueEvents } from "@/lib/queue-events";
import { getAuthIdentity, isAuthenticated, verifyRoomAccess } from "@/lib/room-auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;
  const identity = await getAuthIdentity(req);

  if (!isAuthenticated(identity)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const hasAccess = await verifyRoomAccess(roomId, identity);
  if (!hasAccess) {
    return new Response("Forbidden", { status: 403 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send initial keepalive
      controller.enqueue(encoder.encode(": connected\n\n"));

      const unsubscribe = queueEvents.subscribe(roomId, (data) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          unsubscribe();
        }
      });

      // Keepalive every 30s
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(keepalive);
          unsubscribe();
        }
      }, 30_000);

      // Cleanup on abort
      req.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        unsubscribe();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
