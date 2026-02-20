import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitPreset } from "@/lib/rate-limit";
import { getAuthIdentity, isAuthenticated, verifyRoomAccess } from "@/lib/room-auth";
import { queueEvents } from "@/lib/queue-events";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const identity = await getAuthIdentity(req);

  if (!isAuthenticated(identity)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify membership
  const hasAccess = await verifyRoomAccess(id, identity);
  if (!hasAccess) {
    return NextResponse.json({ error: "Not a member of this room" }, { status: 403 });
  }

  const items = await prisma.queueItem.findMany({
    where: { roomId: id, playedAt: null },
    orderBy: [{ votes: "desc" }, { addedAt: "asc" }],
  });

  const userIds = [...new Set(items.map((i) => i.addedBy))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, displayName: true },
  });
  const nameMap = Object.fromEntries(users.map((u) => [u.id, u.displayName]));

  return NextResponse.json(
    items.map((i) => ({
      ...i,
      addedByName: nameMap[i.addedBy] ?? "Okänd",
      votedBy: JSON.parse(i.votedBy || "[]"),
    }))
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimitPreset(req, "queue");
  if (limited) return limited;
  const { id } = await params;
  const identity = await getAuthIdentity(req);

  if (!isAuthenticated(identity)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify membership
  const hasAccess = await verifyRoomAccess(id, identity);
  if (!hasAccess) {
    return NextResponse.json({ error: "Not a member of this room" }, { status: 403 });
  }

  const { trackId, trackName, artistName, albumImage, durationMs } = await req.json();
  if (!trackId || !trackName || !artistName) {
    return NextResponse.json({ error: "Missing track data" }, { status: 400 });
  }

  const addedBy = identity.userId || identity.guestId!;

  const item = await prisma.queueItem.create({
    data: {
      roomId: id,
      addedBy,
      trackId,
      trackName,
      artistName,
      albumImage: albumImage ?? null,
      durationMs: durationMs ?? 0,
    },
  });

  // Notify SSE listeners
  queueEvents.notify(id, "queue-update", { action: "add", itemId: item.id });

  return NextResponse.json(item);
}
