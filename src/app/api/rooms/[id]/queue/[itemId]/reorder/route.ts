import { rateLimitPreset } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthIdentity, isAuthenticated, verifyRoomAccess } from "@/lib/room-auth";
import { queueEvents } from "@/lib/queue-events";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const limited = rateLimitPreset(req, "queue");
  if (limited) return limited;
  const { id: roomId, itemId } = await params;
  const identity = await getAuthIdentity(req);

  if (!isAuthenticated(identity)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify membership
  const hasAccess = await verifyRoomAccess(roomId, identity);
  if (!hasAccess) {
    return NextResponse.json({ error: "Not a member of this room" }, { status: 403 });
  }

  const { direction } = await req.json() as { direction: "up" | "down" };
  if (direction !== "up" && direction !== "down") {
    return NextResponse.json({ error: "Invalid direction" }, { status: 400 });
  }

  const queue = await prisma.queueItem.findMany({
    where: { roomId, playedAt: null },
    orderBy: [{ votes: "desc" }, { addedAt: "asc" }],
  });

  const currentIndex = queue.findIndex((item) => item.id === itemId);
  if (currentIndex === -1) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= queue.length) {
    return NextResponse.json({ error: "Already at edge" }, { status: 400 });
  }

  const current = queue[currentIndex];
  const target = queue[targetIndex];

  await prisma.$transaction([
    prisma.queueItem.update({ where: { id: current.id }, data: { votes: target.votes } }),
    prisma.queueItem.update({ where: { id: target.id }, data: { votes: current.votes } }),
  ]);

  if (current.votes === target.votes) {
    await prisma.$transaction([
      prisma.queueItem.update({ where: { id: current.id }, data: { addedAt: target.addedAt } }),
      prisma.queueItem.update({ where: { id: target.id }, data: { addedAt: current.addedAt } }),
    ]);
  }

  queueEvents.notify(roomId, "queue-update", { action: "reorder" });
  return NextResponse.json({ ok: true });
}
