import { rateLimitPreset } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthIdentity, isAuthenticated, verifyRoomAccess } from "@/lib/room-auth";
import { queueEvents } from "@/lib/queue-events";

type Params = { params: Promise<{ id: string; itemId: string }> };

/**
 * Atomic vote toggle using a serialized transaction.
 * Prevents race conditions where two concurrent votes could read the same
 * votedBy state and overwrite each other.
 */
async function atomicVoteToggle(
  roomId: string,
  itemId: string,
  voterId: string,
  forceRemove = false
): Promise<{ error?: string; status?: number; updated?: any; hasVoted?: boolean }> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Read inside transaction for consistency
      const item = await tx.queueItem.findUnique({ where: { id: itemId } });
      if (!item) throw Object.assign(new Error("Item not found"), { status: 404 });
      if (item.roomId !== roomId) throw Object.assign(new Error("Item not in this room"), { status: 400 });

      const votedBy: string[] = JSON.parse(item.votedBy || "[]");
      const hasVoted = votedBy.includes(voterId);

      if (forceRemove && !hasVoted) {
        throw Object.assign(new Error("Not voted"), { status: 400 });
      }

      const shouldRemove = forceRemove || hasVoted;
      const newVotedBy = shouldRemove
        ? votedBy.filter((uid) => uid !== voterId)
        : [...votedBy, voterId];

      const updated = await tx.queueItem.update({
        where: { id: itemId },
        data: {
          votes: newVotedBy.length, // Derive from source of truth instead of increment
          votedBy: JSON.stringify(newVotedBy),
        },
      });

      return { updated, hasVoted: !shouldRemove };
    });

    return result;
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
