import { rateLimitPreset } from "@/lib/rate-limit";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const limited = rateLimitPreset(req, "general");
  if (limited) return limited;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const genres: string[] = Array.isArray(body.genres) ? body.genres : [];
    const artists: string[] = Array.isArray(body.artists) ? body.artists : [];
    const artistIds: string[] = Array.isArray(body.artistIds) ? body.artistIds : [];

    if (genres.length === 0 && artists.length === 0) {
      return NextResponse.json({ error: "At least one genre or artist required" }, { status: 400 });
    }

    const userId = session.user.id;

    const preferences = [
      ...genres.map((g) => ({ userId, type: "genre" as const, value: g, weight: 1.0 })),
      ...artists.map((a) => ({ userId, type: "artist" as const, value: a, weight: 1.0 })),
    ];

    await prisma.$transaction([
      prisma.preference.deleteMany({ where: { userId } }),
      ...preferences.map((p) => prisma.preference.create({ data: p })),
      prisma.user.update({
        where: { id: userId },
        data: {
          onboarded: true,
          genres: JSON.stringify(genres),
          artists: JSON.stringify(artists),
          ...(artistIds.length > 0 ? { artistIds: JSON.stringify(artistIds) } : {}),
        },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Onboarding error:", error);
    return NextResponse.json({ error: "Failed to save onboarding data" }, { status: 500 });
  }
}
