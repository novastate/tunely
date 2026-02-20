import { rateLimitPreset } from "@/lib/rate-limit";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { fetchTopArtists, extractGenres } from "@/lib/spotify";

export async function GET(req: Request) {
  const limited = rateLimitPreset(req, "general");
  if (limited) return limited;
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const artists = await fetchTopArtists(session.accessToken);
  const genres = extractGenres(artists);

  return NextResponse.json({
    artists: artists.map((a) => ({
      id: a.id,
      name: a.name,
      image: a.images[0]?.url ?? null,
      genres: a.genres,
    })),
    genres,
  });
}
