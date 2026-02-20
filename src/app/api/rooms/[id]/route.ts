import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthIdentity, isAuthenticated, verifyRoomAccess } from "@/lib/room-auth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const identity = await getAuthIdentity(req);

  if (!isAuthenticated(identity)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const room = await prisma.room.findUnique({
    where: { id },
    include: {
      _count: { select: { members: true, queue: true } },
      members: {
        include: { room: false },
        take: 20,
      },
    },
  });

  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const hasAccess = await verifyRoomAccess(id, identity);
  if (!hasAccess) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  return NextResponse.json(room);
}
