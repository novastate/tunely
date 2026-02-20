import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId, guestId, roomId } = await req.json();

  if (!userId && !guestId) {
    return NextResponse.json({ error: "userId or guestId required" }, { status: 400 });
  }

  try {
    const request = await prisma.friendRequest.create({
      data: {
        fromUserId: session.user.id,
        toUserId: userId || null,
        toGuestId: guestId || null,
        status: "pending",
        roomId: roomId || null,
      },
    });

    return NextResponse.json({ success: true, requestId: request.id });
  } catch (err: unknown) {
    // Unique constraint = already sent
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Vänförfrågan redan skickad" }, { status: 409 });
    }
    throw err;
  }
}
