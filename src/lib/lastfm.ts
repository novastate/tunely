const LASTFM_API_KEY = process.env.LASTFM_API_KEY || '';
const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';

export interface LastfmTrack {
  name: string;
  artist: { name: string };
  playcount?: string;
  match?: number;
}

export interface LastfmArtist {
  name: string;
  match?: string;
}

async function lastfmFetch(params: Record<string, string>) {
  if (!LASTFM_API_KEY) {
    console.warn('LASTFM_API_KEY not set, skipping Last.fm query');
    return null;
  }
  const searchParams = new URLSearchParams({
    ...params,
    api_key: LASTFM_API_KEY,
    format: 'json',
  });
  try {
    const res = await fetch(`${LASTFM_BASE}?${searchParams}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('Last.fm fetch error:', e);
    return null;
  }
}

export async function getSimilarTracks(artist: string, track: string, limit = 10): Promise<LastfmTrack[]> {
  const data = await lastfmFetch({
    method: 'track.getSimilar',
    artist,
    track,
    limit: String(limit),
  });
  return data?.similartracks?.track || [];
}

export async function getSimilarArtists(artist: string, limit = 10): Promise<LastfmArtist[]> {
  const data = await lastfmFetch({
    method: 'artist.getSimilar',
    artist,
    limit: String(limit),
  });
  return data?.similarartists?.artist || [];
}

export async function getTopTracks(artist: string, limit = 10): Promise<LastfmTrack[]> {
  const data = await lastfmFetch({
    method: 'artist.getTopTracks',
    artist,
    limit: String(limit),
  });
  return data?.toptracks?.track || [];
}

export async function getChartTopTracks(limit = 10): Promise<LastfmTrack[]> {
  const data = await lastfmFetch({
    method: 'chart.getTopTracks',
    limit: String(limit),
  });
  return data?.tracks?.track || [];
}

export async function getTagTopTracks(tag: string, limit = 10): Promise<LastfmTrack[]> {
  const data = await lastfmFetch({
    method: 'tag.getTopTracks',
    tag,
    limit: String(limit),
  });
  return data?.tracks?.track || [];
}

export function isAvailable(): boolean {
  return !!LASTFM_API_KEY;
}
