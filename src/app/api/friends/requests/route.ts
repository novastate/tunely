import { rateLimitPreset } from "@/lib/rate-limit";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const limited = rateLimitPreset(req, "general");
  if (limited) return limited;
  const url = new URL(req.url);
  const type = url.searchParams.get("type"); // "received" for logged-in users
  const guestId = url.searchParams.get("guestId");

  // Guest requests
  if (guestId) {
    const requests = await prisma.friendRequest.findMany({
      where: { toGuestId: guestId, status: "pending" },
      include: { fromUser: { select: { name: true, image: true } } },
    });
    return NextResponse.json(requests);
  }

  // Logged-in user requests
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (type === "received") {
    const requests = await prisma.friendRequest.findMany({
      where: { toUserId: session.user.id, status: "pending" },
      include: { fromUser: { select: { name: true, image: true } } },
    });
    return NextResponse.json(requests);
  }

  // Default: sent requests
  const requests = await prisma.friendRequest.findMany({
    where: { fromUserId: session.user.id },
    include: { toUser: { select: { name: true } } },
  });
  return NextResponse.json(requests);
}
