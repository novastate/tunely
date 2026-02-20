import { rateLimitPreset } from "@/lib/rate-limit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const limited = rateLimitPreset(req, "export");
  if (limited) return limited;
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, trackUris } = await req.json();

  if (!Array.isArray(trackUris) || trackUris.length === 0) {
    return NextResponse.json({ error: "No tracks to export" }, { status: 400 });
  }

  const playlistName = name || `Musik-app kö ${new Date().toLocaleDateString("sv-SE")}`;

  // 1. Create playlist
  const createRes = await fetch(
    `https://api.spotify.com/v1/users/${session.user.spotifyId}/playlists`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: playlistName,
        description: "Exporterad från Musik-app",
        public: false,
      }),
    }
  );

  if (!createRes.ok) {
    const err = await createRes.text();
    return NextResponse.json({ error: `Failed to create playlist: ${err}` }, { status: 500 });
  }

  const playlist = await createRes.json();

  // 2. Add tracks (max 100 per request)
  for (let i = 0; i < trackUris.length; i += 100) {
    const batch = trackUris.slice(i, i + 100);
    await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: batch }),
    });
  }

  return NextResponse.json({
    ok: true,
    playlistId: playlist.id,
    playlistUrl: playlist.external_urls.spotify,
    name: playlistName,
    trackCount: trackUris.length,
  });
}
