/**
 * Spotify Charts via official chart playlists.
 * These are Spotify-curated playlists that require a valid access token.
 */
import { cached, TTL } from "./cache";
import { requestQueue } from "./request-queue";

export const CHART_PLAYLISTS = {
  'top-global': '37i9dQZEVXbMDoHDwVN2tF',
  'top-sweden': '37i9dQZEVXbLp5XoPON0wI',
  'viral-global': '37i9dQZEVXbLiRSasKsNU9',
  'viral-sweden': '37i9dQZEVXbJoP1vMsLrMT',
} as const;

export type ChartType = keyof typeof CHART_PLAYLISTS;

export interface ChartTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { id: string; name: string; images: { url: string; width: number; height: number }[] };
  uri: string;
  popularity: number;
  duration_ms: number;
  preview_url: string | null;
}

/**
 * Fetch tracks from a Spotify chart playlist.
 * Returns raw Spotify track objects (same shape as search results).
 */
export async function getSpotifyChartTracks(
  accessToken: string,
  chart: ChartType = 'viral-global',
  limit = 20
): Promise<ChartTrack[]> {
  return cached(`spotify:chart:${chart}:${limit}`, TTL.SPOTIFY_CHARTS, async () => {
    const playlistId = CHART_PLAYLISTS[chart];

    const res = await requestQueue.add(() =>
      fetch(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&fields=items(track(id,name,artists(id,name),album(id,name,images),uri,popularity,duration_ms,preview_url))`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      )
    );

    if (!res.ok) {
      console.error(`Spotify charts fetch failed for ${chart}:`, res.status);
      return [];
    }

    const data = await res.json();

    return (data.items ?? [])
      .filter((item: any) => item.track && item.track.id)
      .map((item: any) => item.track as ChartTrack);
  });
}
