import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const friends = await prisma.friend.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(friends);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { friendName, spotifyId, email } = await req.json();
  if (!friendName?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const friend = await prisma.friend.create({
    data: {
      userId: session.user.id,
      friendName: friendName.trim(),
      spotifyId: spotifyId?.trim() || null,
      email: email?.trim() || null,
    },
  });

  return NextResponse.json(friend);
}
