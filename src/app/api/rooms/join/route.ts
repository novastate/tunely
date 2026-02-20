import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { createGuestToken, getGuestFromRequest } from "@/lib/guest-auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const { code, token, guestName } = await req.json();

  let roomId: string | null = null;

  // Join via invite token
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as {
        roomId: string;
        expiresAt: number;
      };
      if (decoded.expiresAt < Date.now()) {
        return NextResponse.json({ error: "Inbjudan har gått ut" }, { status: 400 });
      }
      roomId = decoded.roomId;
    } catch {
      return NextResponse.json({ error: "Ogiltig inbjudan" }, { status: 400 });
    }
  }

  // Join via code
  if (!roomId && code) {
    const room = await prisma.room.findUnique({ where: { code: code.toUpperCase().trim() } });
    if (!room) return NextResponse.json({ error: "Rum hittades inte" }, { status: 404 });

    if (room.visibility === "private" && session?.user?.id !== room.ownerId) {
      return NextResponse.json({ error: "Detta rum är privat. Be ägaren om en inbjudningslänk." }, { status: 403 });
    }

    roomId = room.id;
  }

  if (!roomId) {
    return NextResponse.json({ error: "Kod eller inbjudan krävs" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return NextResponse.json({ error: "Rum hittades inte" }, { status: 404 });

  // Authenticated user
  if (session?.user?.id) {
    await prisma.roomMember.upsert({
      where: { roomId_userId: { roomId: room.id, userId: session.user.id } },
      update: {},
      create: { roomId: room.id, userId: session.user.id },
    });
    return NextResponse.json(room);
  }

  // Guest user - check existing JWT token first
  const existingGuest = getGuestFromRequest(req);
  if (existingGuest) {
    const existing = await prisma.roomMember.findFirst({
      where: { roomId: room.id, guestId: existingGuest.guestId },
    });
    if (!existing) {
      await prisma.roomMember.create({
        data: { roomId: room.id, guestId: existingGuest.guestId, guestName: existingGuest.guestName },
      });
    }
    return NextResponse.json(room);
  }

  // New guest - require name, create signed JWT
  if (!guestName || typeof guestName !== "string" || !guestName.trim()) {
    return NextResponse.json({ error: "Logga in eller ange ett namn" }, { status: 401 });
  }

  const { token: guestJwt, guestId } = createGuestToken(guestName.trim());

  await prisma.roomMember.create({
    data: { roomId: room.id, guestId, guestName: guestName.trim() },
  });

  // Return the JWT so the client can store it
  const response = NextResponse.json({ ...room, guestToken: guestJwt });
  // Also set as httpOnly cookie for API requests
  response.cookies.set("guestToken", guestJwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });

  return response;
}
