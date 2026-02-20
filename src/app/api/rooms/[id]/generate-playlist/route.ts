import { rateLimitPreset } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generatePlaylistForRoom, MemberPreferences, PlaylistMode } from "@/lib/playlist-generator";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = rateLimitPreset(req, "generate");
  if (limited) return limited;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: roomId } = await params;

  // Parse mode from request body
  let mode: PlaylistMode = "mixed";
  let totalTracks = 30;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.mode && ["mixed", "dinner", "party", "background", "workout"].includes(body.mode)) {
      mode = body.mode as PlaylistMode;
    }
    if (body.totalTracks && typeof body.totalTracks === "number") {
      totalTracks = Math.min(50, Math.max(10, body.totalTracks));
    }
  } catch {}

  // Verify user is member of this room
  const membership = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId: session.user.id } },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Get all members with their preferences
  const roomMembers = await prisma.roomMember.findMany({
    where: { roomId },
  });

  const memberPrefs: MemberPreferences[] = [];

  for (const rm of roomMembers) {
    const memberId = rm.userId;
    if (!memberId) continue; // skip guests
    const user = await prisma.user.findUnique({ where: { id: memberId } });
    if (!user) continue;

    const prefs = await prisma.preference.findMany({
      where: { userId: memberId },
    });

    const genres = prefs
      .filter((p) => p.type === "genre")
      .map((p) => ({ value: p.value, weight: p.weight }));
    const artists = prefs
      .filter((p) => p.type === "artist")
      .map((p) => ({ value: p.value, weight: p.weight }));

    memberPrefs.push({
      userId: memberId,
      displayName: user.displayName || user.name || "Unknown",
      genres,
      artists,
    });
  }

  if (memberPrefs.length === 0) {
    return NextResponse.json({ error: "No members with preferences" }, { status: 400 });
  }

  try {
    const tracks = await generatePlaylistForRoom(
      memberPrefs,
      session.accessToken as string,
      totalTracks,
      mode
    );

    if (tracks.length === 0) {
      return NextResponse.json(
        { error: "Inga låtar hittades. Kontrollera att medlemmarna har valt genres/artister i sina preferenser." },
        { status: 404 }
      );
    }

    return NextResponse.json({ tracks, memberCount: memberPrefs.length });
  } catch (e: unknown) {
    console.error("Generate playlist error:", e);
    const message = e instanceof Error ? e.message : "Okänt fel vid generering";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
