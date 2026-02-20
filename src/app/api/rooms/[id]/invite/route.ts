import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return NextResponse.json({ error: "Rum hittades inte" }, { status: 404 });

  if (room.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Bara ägaren kan bjuda in" }, { status: 403 });
  }

  const inviteToken = jwt.sign(
    { roomId: room.id, expiresAt: Date.now() + 24 * 60 * 60 * 1000 },
    process.env.NEXTAUTH_SECRET!
  );

  const baseUrl = req.headers.get("origin") || process.env.NEXTAUTH_URL || "http://localhost:3000";
  const inviteUrl = `${baseUrl}/join?token=${inviteToken}`;

  return NextResponse.json({ inviteUrl, token: inviteToken });
}
