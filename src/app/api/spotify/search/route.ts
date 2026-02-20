import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { searchArtists } from "@/lib/spotify";
import { getServerSpotifyToken } from "@/lib/spotify-server";
import { rateLimitPreset } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const limited = rateLimitPreset(req, "search");
  if (limited) return limited;
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = session.accessToken || await getServerSpotifyToken();

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";

  const artists = await searchArtists(token, q);

  return NextResponse.json({
    artists: artists.map((a) => ({
      id: a.id,
      name: a.name,
      image: a.images[0]?.url ?? null,
    })),
  });
}
