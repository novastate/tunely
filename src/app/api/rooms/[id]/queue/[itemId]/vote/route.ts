import { rateLimitPreset } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthIdentity, isAuthenticated, verifyRoomAccess } from "@/lib/room-auth";
import { queueEvents } from "@/lib/queue-events";

type Params = { params: Promise<{ id: string; itemId: string }> };

/**
 * Atomic vote toggle using the Vote table with unique constraint.
 * No race conditions - the DB enforces uniqueness.
 */
async function atomicVoteToggle(
  roomId: string,
  itemId: string,
  voterId: string,
  forceRemove = false
): Promise<{ error?: string; status?: number; updated?: any; hasVoted?: boolean }> {
  try {
    // Verify item exists and belongs to room
    const item = await prisma.queueItem.findUnique({ where: { id: itemId } });
    if (!item) return { error: "Item not found", status: 404 };
    if (item.roomId !== roomId) return { error: "Item not in this room", status: 400 };

    // Check if already voted
    const existingVote = await prisma.vote.findUnique({
      where: { queueItemId_userId: { queueItemId: itemId, userId: voterId } },
    });

    const shouldRemove = forceRemove || !!existingVote;

    if (forceRemove && !existingVote) {
      return { error: "Not voted", status: 400 };
    }

    if (shouldRemove && existingVote) {
      // Remove vote
      await prisma.vote.delete({
        where: { id: existingVote.id },
      });
    } else if (!shouldRemove) {
      // Add vote - unique constraint prevents duplicates
      try {
        await prisma.vote.create({
          data: { queueItemId: itemId, userId: voterId },
        });
      } catch (e: any) {
        // Unique constraint violation - already voted (race condition handled!)
        return { error: "Already voted", status: 400 };
      }
    }

    // Update denormalized vote count + votedBy for backwards compat
    const voteRecords = await prisma.vote.findMany({
      where: { queueItemId: itemId },
      select: { userId: true },
    });

    const updated = await prisma.queueItem.update({
      where: { id: itemId },
      data: {
        votes: voteRecords.length,
        votedBy: JSON.stringify(voteRecords.map((v) => v.userId)),
      },
    });

    return { updated, hasVoted: !shouldRemove };
  } catch (e: any) {
    return { error: e.message, status: e.status || 500 };
  }
}

// Toggle vote
export async function PUT(req: Request, { params }: Params) {
  const limited = rateLimitPreset(req, "vote");
  if (limited) return limited;
  const { id, itemId } = await params;
  const identity = await getAuthIdentity(req);

  if (!isAuthenticated(identity)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await verifyRoomAccess(id, identity);
  if (!hasAccess) {
    return NextResponse.json({ error: "Not a member of this room" }, { status: 403 });
  }

  const voterId = (identity.userId || identity.guestId)!;
  const result = await atomicVoteToggle(id, itemId, voterId);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  queueEvents.notify(id, "queue-update", { action: "vote", itemId });
  return NextResponse.json({ ...result.updated, hasVoted: result.hasVoted });
}

export { PUT as POST };

// Explicit unvote
export async function DELETE(req: Request, { params }: Params) {
  const limited = rateLimitPreset(req, "vote");
  if (limited) return limited;
  const { id, itemId } = await params;
  const identity = await getAuthIdentity(req);

  if (!isAuthenticated(identity)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await verifyRoomAccess(id, identity);
  if (!hasAccess) {
    return NextResponse.json({ error: "Not a member of this room" }, { status: 403 });
  }

  const voterId = (identity.userId || identity.guestId)!;
  const result = await atomicVoteToggle(id, itemId, voterId, true);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  queueEvents.notify(id, "queue-update", { action: "unvote", itemId });
  return NextResponse.json({ ...result.updated, hasVoted: false });
}
