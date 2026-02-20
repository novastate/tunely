import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { trackUris, deviceId } = await req.json();

  if (!Array.isArray(trackUris) || trackUris.length === 0) {
    return NextResponse.json({ error: "No tracks provided" }, { status: 400 });
  }

  const url = new URL("https://api.spotify.com/v1/me/player/play");
  if (deviceId) url.searchParams.set("device_id", deviceId);

  const res = await fetch(url.toString(), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ uris: trackUris }),
  });

  if (!res.ok && res.status !== 204) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: res.status });
  }

  return NextResponse.json({ ok: true, count: trackUris.length });
}
