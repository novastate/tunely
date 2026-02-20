import { rateLimitPreset } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthIdentity, isAuthenticated, verifyRoomAccess } from "@/lib/room-auth";

type Params = { params: Promise<{ id: string; itemId: string }> };

async function getItemAndValidate(roomId: string, itemId: string, voterId: string) {
  const item = await prisma.queueItem.findUnique({ where: { id: itemId } });
  if (!item) return { error: "Item not found", status: 404 };
  if (item.roomId !== roomId) return { error: "Item not in this room", status: 400 };

  const votedBy: string[] = JSON.parse(item.votedBy || "[]");
  return { item, votedBy };
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
  const result = await getItemAndValidate(id, itemId, voterId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const { votedBy } = result;
  const hasVoted = votedBy.includes(voterId);

  let newVotedBy: string[];
  let voteChange: number;

  if (hasVoted) {
    newVotedBy = votedBy.filter((uid) => uid !== voterId);
    voteChange = -1;
  } else {
    newVotedBy = [...votedBy, voterId];
    voteChange = 1;
  }

  const updated = await prisma.queueItem.update({
    where: { id: itemId },
    data: {
      votes: { increment: voteChange },
      votedBy: JSON.stringify(newVotedBy),
    },
  });

  return NextResponse.json({ ...updated, hasVoted: !hasVoted });
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
  const result = await getItemAndValidate(id, itemId, voterId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const { votedBy } = result;
  if (!votedBy.includes(voterId)) {
    return NextResponse.json({ error: "Not voted" }, { status: 400 });
  }

  const updated = await prisma.queueItem.update({
    where: { id: itemId },
    data: {
      votes: { decrement: 1 },
      votedBy: JSON.stringify(votedBy.filter((uid) => uid !== voterId)),
    },
  });

  return NextResponse.json({ ...updated, hasVoted: false });
}
