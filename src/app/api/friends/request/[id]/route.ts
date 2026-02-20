import { rateLimitPreset } from "@/lib/rate-limit";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimitPreset(req, "general");
  if (limited) return limited;
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action } = await req.json();
  if (action !== "accept" && action !== "reject") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const request = await prisma.friendRequest.findUnique({ where: { id } });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Verify the current user is the recipient
  if (request.toUserId !== session.user.id) {
    return NextResponse.json({ error: "Not your request" }, { status: 403 });
  }

  await prisma.friendRequest.update({
    where: { id },
    data: { status: action === "accept" ? "accepted" : "rejected" },
  });

  if (action === "accept") {
    // Get the sender's name
    const sender = await prisma.user.findUnique({ where: { id: request.fromUserId } });
    const receiver = await prisma.user.findUnique({ where: { id: session.user.id } });

    // Create bidirectional friendships (ignore if already exists)
    try {
      await prisma.friend.create({
        data: {
          userId: request.fromUserId,
          friendName: receiver?.name || "Vän",
          friendId: session.user.id,
          email: receiver?.email || null,
        },
      });
    } catch { /* already exists */ }
    try {
      await prisma.friend.create({
        data: {
          userId: session.user.id,
          friendName: sender?.name || "Vän",
          friendId: request.fromUserId,
          email: sender?.email || null,
        },
      });
    } catch { /* already exists */ }
  }

  return NextResponse.json({ success: true });
}
