const SPOTIFY_API = "https://api.spotify.com/v1";

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { name: string; images: { url: string }[] };
  duration_ms: number;
  uri: string;
  popularity?: number;
}

/**
 * Get track recommendations using search-based approach.
 * The /recommendations endpoint was deprecated by Spotify (Nov 2024) for new/dev-mode apps.
 * This uses /search with genre and artist keywords as a workaround.
 */
export async function getRecommendations(params: {
  seedGenres?: string[];
  seedArtists?: string[];
  seedTracks?: string[];
  limit?: number;
  accessToken: string;
}): Promise<SpotifyTrack[]> {
  const limit = params.limit ?? 20;
  const genres = params.seedGenres ?? [];
  const artists = params.seedArtists ?? [];

  if (genres.length === 0 && artists.length === 0) return [];

  const seen = new Set<string>();
  const results: SpotifyTrack[] = [];

  // Build search queries from seeds
  const queries: string[] = [];

  // Artist-based searches (most relevant)
  for (const artist of artists.slice(0, 3)) {
    queries.push(`artist:${artist}`);
  }

  // Genre-based searches
  for (const genre of genres.slice(0, 3)) {
    queries.push(`genre:${genre}`);
  }

  // Combined genre+artist if we have both
  if (genres.length > 0 && artists.length > 0) {
    queries.push(`genre:${genres[0]} artist:${artists[0]}`);
  }

  // If still no queries, use genre tags as plain search
  if (queries.length === 0) {
    queries.push("popular music 2025");
  }

  const perQuery = Math.max(5, Math.ceil(limit / queries.length));

  for (const q of queries) {
    if (results.length >= limit) break;

    // Add randomness via offset to avoid always getting same tracks
    const offset = Math.floor(Math.random() * 20);
    const res = await fetch(
      `${SPOTIFY_API}/search?q=${encodeURIComponent(q)}&type=track&limit=${perQuery}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${params.accessToken}` } }
    );

    if (!res.ok) {
      console.warn(`Search failed for "${q}": ${res.status}`);
      continue;
    }

    const data = await res.json();
    const tracks: SpotifyTrack[] = data.tracks?.items ?? [];

    for (const t of tracks) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      results.push(t);
      if (results.length >= limit) break;
    }
  }

  return results;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  genres: string[];
  images: { url: string }[];
  popularity: number;
}

export interface SpotifyTopArtistsResponse {
  items: SpotifyArtist[];
}

export async function fetchTopArtists(
  accessToken: string,
  limit = 20
): Promise<SpotifyArtist[]> {
  const res = await fetch(
    `${SPOTIFY_API}/me/top/artists?limit=${limit}&time_range=medium_term`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return [];
  const data: SpotifyTopArtistsResponse = await res.json();
  return data.items;
}

/**
 * Get a single artist by Spotify ID — returns exact data, no fuzzy matching.
 */
export async function getArtist(
  accessToken: string,
  artistId: string
): Promise<SpotifyArtist | null> {
  const res = await fetch(`${SPOTIFY_API}/artists/${artistId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return await res.json();
}

export async function searchArtists(
  accessToken: string,
  query: string,
  limit = 10
): Promise<SpotifyArtist[]> {
  if (!query.trim()) return [];
  const res = await fetch(
    `${SPOTIFY_API}/search?q=${encodeURIComponent(query)}&type=artist&limit=${limit}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.artists?.items ?? [];
}

/**
 * Get audio features for tracks (energy, danceability, valence, etc.)
 * Used for mode-based filtering (party = high energy, dinner = low energy).
 */
export interface AudioFeatures {
  id: string;
  energy: number;
  danceability: number;
  valence: number;
  tempo: number;
  acousticness: number;
  instrumentalness: number;
}

export async function getAudioFeatures(
  accessToken: string,
  trackIds: string[]
): Promise<Map<string, AudioFeatures>> {
  const result = new Map<string, AudioFeatures>();
  if (trackIds.length === 0) return result;

  // Spotify allows max 100 IDs per request
  for (let i = 0; i < trackIds.length; i += 100) {
    const batch = trackIds.slice(i, i + 100);
    const res = await fetch(
      `${SPOTIFY_API}/audio-features?ids=${batch.join(',')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) continue;
    const data = await res.json();
    for (const af of data.audio_features ?? []) {
      if (af) result.set(af.id, af);
    }
  }
  return result;
}

export function extractGenres(artists: SpotifyArtist[]): string[] {
  const genreCount = new Map<string, number>();
  for (const artist of artists) {
    for (const genre of artist.genres ?? []) {
      genreCount.set(genre, (genreCount.get(genre) ?? 0) + 1);
    }
  }
  return [...genreCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([genre]) => genre);
}
