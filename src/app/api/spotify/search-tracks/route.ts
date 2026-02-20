import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getServerSpotifyToken } from "@/lib/spotify-server";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = session.accessToken || await getServerSpotifyToken();

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ tracks: [] });

  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=10`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) return NextResponse.json({ tracks: [] });

  const data = await res.json();
  const tracks = (data.tracks?.items ?? []).map((t: Record<string, unknown>) => ({
    id: t.id,
    name: t.name,
    artists: (t.artists as { name: string }[]).map((a) => a.name).join(", "),
    albumImage: ((t.album as { images: { url: string }[] }).images[0]?.url) ?? null,
    durationMs: t.duration_ms,
  }));

  return NextResponse.json({ tracks });
}
