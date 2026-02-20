import { rateLimitPreset } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthIdentity, isAuthenticated, verifyRoomAccess, verifyRoomOwner } from "@/lib/room-auth";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const limited = rateLimitPreset(_req, "general");
  if (limited) return limited;
  const { id, itemId } = await params;
  const identity = await getAuthIdentity(_req);

  if (!isAuthenticated(identity)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify membership
  const hasAccess = await verifyRoomAccess(id, identity);
  if (!hasAccess) {
    return NextResponse.json({ error: "Not a member of this room" }, { status: 403 });
  }

  const item = await prisma.queueItem.findUnique({ where: { id: itemId } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Allow deletion if: item owner, or room owner
  const isItemOwner = item.addedBy === (identity.userId || identity.guestId);
  const isOwner = identity.userId ? await verifyRoomOwner(id, identity.userId) : false;

  if (!isItemOwner && !isOwner) {
    return NextResponse.json({ error: "Not authorized to delete this item" }, { status: 403 });
  }

  await prisma.queueItem.delete({ where: { id: itemId } });
  return NextResponse.json({ ok: true });
}
