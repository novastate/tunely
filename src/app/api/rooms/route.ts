import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimitCheck } from "@/lib/rate-limit";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function POST(req: Request) {
  const limited = rateLimitCheck(req);
  if (limited) return limited;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, visibility = "private" } = await req.json();
  if (!name || typeof name !== "string") return NextResponse.json({ error: "Name required" }, { status: 400 });

  let code = generateCode();
  while (await prisma.room.findUnique({ where: { code } })) {
    code = generateCode();
  }

  const room = await prisma.room.create({
    data: {
      name,
      code,
      ownerId: session.user.id,
      visibility: visibility === "public" ? "public" : "private",
      members: { create: { userId: session.user.id } },
    },
  });

  return NextResponse.json(room);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rooms = await prisma.room.findMany({
    where: { members: { some: { userId: session.user.id } } },
    include: { _count: { select: { queue: true, members: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(rooms);
}
