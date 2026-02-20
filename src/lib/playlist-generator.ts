import { getRecommendations, SpotifyTrack, searchArtists, getAudioFeatures, AudioFeatures } from "./spotify";
import { requestQueue } from "./request-queue";
import * as lastfm from "./lastfm";
import { isNameMatch, genreAffinity, MIN_GENRE_AFFINITY } from "./discovery-filters";
import { getSpotifyChartTracks, ChartType } from "./spotify-charts";

export interface MemberPreferences {
  userId: string;
  displayName: string;
  genres: { value: string; weight: number }[];
  artists: { value: string; weight: number }[];
}

export interface GeneratedTrack extends SpotifyTrack {
  reason: string;
  forMembers: string[];
}

export type PlaylistMode = "mixed" | "dinner" | "party" | "background" | "workout";

interface GenreScore {
  genre: string;
  totalWeight: number;
  memberCount: number;
  members: string[];
}

interface ModeConfig {
  tags: string[];
  label: string;
}

const MODE_CONFIGS: Record<PlaylistMode, ModeConfig> = {
  mixed: { tags: [], label: "Blandat" },
  dinner: { tags: ["dinner", "jazz", "acoustic", "bossa nova", "lounge"], label: "Dinner" },
  party: { tags: ["party", "dance", "edm", "club", "pop"], label: "Party" },
  background: { tags: ["ambient", "chillout", "instrumental", "lo-fi", "downtempo"], label: "Background" },
  workout: { tags: ["workout", "gym", "running", "electronic", "high energy"], label: "Workout" },
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Search Spotify for a track by name and artist.
 * Validates that the result actually matches the intended artist (prevents fuzzy false positives).
 */
async function searchSpotifyTrack(
  trackName: string,
  artistName: string,
  accessToken: string
): Promise<SpotifyTrack | null> {
  const q = `track:${trackName} artist:${artistName}`;
  const res = await requestQueue.add(() =>
    fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=5`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
  );
  if (!res.ok) return null;
  const data = await res.json();
  const items: SpotifyTrack[] = data.tracks?.items ?? [];

  // Find the first result that actually matches the intended artist name
  for (const track of items) {
    const artistMatch = track.artists.some(a => isNameMatch(artistName, a.name));
    if (!artistMatch) continue;
    return track;
  }

  return null;
}

/**
 * Use Last.fm to discover tracks for given artists, then resolve on Spotify.
 * Parallelized: similar artist lookups and track resolution run concurrently.
 */
async function discoverViaLastfm(
  artists: string[],
  accessToken: string,
  limit: number,
  reason: string,
  forMembers: string[],
  userGenres: string[] = []
): Promise<GeneratedTrack[]> {
  const results: GeneratedTrack[] = [];
  const usedIds = new Set<string>();

  // Fully parallel: process ALL seed artists concurrently
  const perArtistTracks = await Promise.allSettled(
    artists.map(async (artist) => {
      const similarArtists = await lastfm.getSimilarArtists(artist, 8);

      const filtered = similarArtists.filter(sim =>
        !(isNameMatch(artist, sim.name) && sim.name.toLowerCase() !== artist.toLowerCase())
      );

      const verifyResults = await Promise.allSettled(
        filtered.map(async (sim) => {
          const spotifyResults = await searchArtists(accessToken, sim.name, 1);
          if (spotifyResults.length === 0) return null;
          const sa = spotifyResults[0];
          if (!isNameMatch(sim.name, sa.name)) return null;
          const affinity = userGenres.length > 0
            ? genreAffinity(userGenres, sa.genres)
            : 1;
          if (affinity < MIN_GENRE_AFFINITY) return null;
          return { name: sa.name, affinity };
        })
      );

      const scored = verifyResults
        .filter((r): r is PromiseFulfilledResult<{ name: string; affinity: number } | null> =>
          r.status === "fulfilled" && r.value !== null
        )
        .map(r => r.value!)
        .sort((a, b) => b.affinity - a.affinity)
        .slice(0, 3);

      const artistsToFetch = [artist, ...scored.map(s => s.name)].slice(0, 4);

      const allTopTracks = await Promise.all(
        artistsToFetch.map(async (fetchArtist) => ({
          artist: fetchArtist,
          tracks: await lastfm.getTopTracks(fetchArtist, 3),
        }))
      );

      const trackCandidates = allTopTracks.flatMap(({ artist: fetchArtist, tracks }) =>
        tracks.map(t => ({ fetchArtist, track: t }))
      );

      const resolvedTracks = await Promise.allSettled(
        trackCandidates.map(async ({ fetchArtist, track: t }) => {
          const spotifyTrack = await searchSpotifyTrack(t.name, t.artist.name, accessToken);
          if (!spotifyTrack) return null;
          const isDiscovery = fetchArtist !== artist;
          return {
            ...spotifyTrack,
            reason: isDiscovery ? `🔍 Liknande ${artist}` : reason,
            forMembers,
          } as GeneratedTrack;
        })
      );

      return resolvedTracks
        .filter((r): r is PromiseFulfilledResult<GeneratedTrack> =>
          r.status === "fulfilled" && r.value !== null
        )
        .map(r => r.value);
    })
  );

  // Merge all artist results, dedup
  for (const artistResult of perArtistTracks) {
    if (results.length >= limit) break;
    if (artistResult.status !== "fulfilled") continue;
    for (const track of artistResult.value) {
      if (results.length >= limit) break;
      if (!usedIds.has(track.id)) {
        usedIds.add(track.id);
        results.push(track);
      }
    }
  }

  return results;
}

/**
 * Task 3: Get trending tracks.
 * Primary: Spotify Charts (real-time chart playlists) when access token available.
 * Fallback: Last.fm charts (for email/password users without Spotify token).
 */
async function getTrendingTracks(
  accessToken: string,
  limit: number,
  mode: PlaylistMode
): Promise<GeneratedTrack[]> {
  const results: GeneratedTrack[] = [];
  const usedIds = new Set<string>();

  // --- Primary: Spotify Charts ---
  if (accessToken) {
    try {
      // Party/workout → Viral 50 (energetic, buzzy tracks)
      // Other modes → Top 50 Sweden (broader appeal)
      const chartType: ChartType = (mode === "party" || mode === "workout")
        ? "viral-global"
        : "top-sweden";

      const chartLabel = chartType === "viral-global" ? "Viral 50" : "Top 50 Sweden";

      const chartTracks = await getSpotifyChartTracks(accessToken, chartType, limit + 5);

      // Shuffle to get variety across generations
      const shuffled = shuffle(chartTracks);

      for (const t of shuffled) {
        if (results.length >= limit) break;
        if (!usedIds.has(t.id)) {
          usedIds.add(t.id);
          results.push({
            id: t.id,
            name: t.name,
            artists: t.artists,
            album: t.album,
            uri: t.uri,
            popularity: t.popularity,
            duration_ms: t.duration_ms,
            preview_url: t.preview_url,
            reason: `🔥 Trending (${chartLabel})`,
            forMembers: ["Alla"],
          } as GeneratedTrack);
        }
      }

      if (results.length > 0) {
        return results;
      }
      // If Spotify Charts returned nothing, fall through to Last.fm
    } catch (err) {
      console.error("Spotify Charts fetch error, falling back to Last.fm:", err);
    }
  }

  // --- Fallback: Last.fm charts ---
  if (!lastfm.isAvailable()) return results;

  const config = MODE_CONFIGS[mode];
  let lfmTracks: lastfm.LastfmTrack[] = [];

  if (mode !== "mixed" && config.tags.length > 0) {
    for (const tag of config.tags.slice(0, 2)) {
      const tagTracks = await lastfm.getTagTopTracks(tag, 5);
      lfmTracks.push(...tagTracks);
      if (lfmTracks.length >= limit * 2) break;
    }
  } else {
    lfmTracks = await lastfm.getChartTopTracks(limit * 2);
  }

  lfmTracks = shuffle(lfmTracks);

  for (const t of lfmTracks) {
    if (results.length >= limit) break;
    const spotifyTrack = await searchSpotifyTrack(t.name, t.artist.name, accessToken);
    if (spotifyTrack && !usedIds.has(spotifyTrack.id)) {
      usedIds.add(spotifyTrack.id);
      results.push({
        ...spotifyTrack,
        reason: mode !== "mixed"
          ? `🔥 Trending (Last.fm ${config.label})`
          : "🔥 Trending (Last.fm)",
        forMembers: ["Alla"],
      });
    }
  }

  return results;
}

/**
 * Task 2: Aggregate genres from ALL members with scoring.
 * Task 5: Use ALL genres with better spread + artist dedup.
 */
function aggregateGenres(members: MemberPreferences[]): {
  allGenres: GenreScore[];
  sharedGenres: GenreScore[];
} {
  const genreScores = new Map<string, GenreScore>();

  for (const member of members) {
    for (const g of member.genres ?? []) {
      const existing = genreScores.get(g.value) ?? {
        genre: g.value,
        totalWeight: 0,
        memberCount: 0,
        members: [],
      };
      existing.totalWeight += g.weight;
      existing.memberCount += 1;
      existing.members.push(member.displayName);
      genreScores.set(g.value, existing);
    }
  }

  const allGenres = [...genreScores.values()].sort(
    (a, b) => b.memberCount - a.memberCount || b.totalWeight - a.totalWeight
  );

  const sharedGenres = allGenres.filter((g) => g.memberCount >= 2);

  return { allGenres, sharedGenres };
}

/**
 * Task 5: Enforce artist diversity — max 2 tracks per artist.
 */
function enforceArtistDiversity(tracks: GeneratedTrack[]): GeneratedTrack[] {
  const artistCounts = new Map<string, number>();
  const result: GeneratedTrack[] = [];
  const overflow: GeneratedTrack[] = [];

  for (const t of tracks) {
    const artistKey = t.artists.map(a => a.name.toLowerCase()).join(", ");
    const count = artistCounts.get(artistKey) || 0;
    if (count >= 2) {
      overflow.push(t);
    } else {
      artistCounts.set(artistKey, count + 1);
      result.push(t);
    }
  }

  return result;
}

/**
 * Main playlist generation with all improvements:
 * - Task 2: Multi-member genre aggregation
 * - Task 3: 20% trending tracks
 * - Task 4: Playlist mode support
 * - Task 5: Better genre spread + artist dedup
 */
export async function generatePlaylistForRoom(
  members: MemberPreferences[],
  accessToken: string,
  totalTracks = 30,
  mode: PlaylistMode = "mixed"
): Promise<GeneratedTrack[]> {
  if (members.length === 0) return [];

  const useLastfm = lastfm.isAvailable();
  const { allGenres, sharedGenres } = aggregateGenres(members);

  // Budget allocation: 20% trending, 30% shared, 50% individual spread
  const trendingCount = useLastfm ? Math.round(totalTracks * 0.2) : 0;
  const remaining = totalTracks - trendingCount;
  const sharedCount = Math.min(
    Math.round(remaining * 0.4),
    sharedGenres.length > 0 ? remaining : 0
  );
  const individualBudget = remaining - sharedCount;
  const perMemberCount = Math.max(1, Math.floor(individualBudget / members.length));

  const usedTrackIds = new Set<string>();

  // === PARALLEL EXECUTION: Run trending, shared, and individual tasks concurrently ===

  // Prepare shared taste data
  const memberNames = sharedGenres.length > 0
    ? [...new Set(sharedGenres.slice(0, 3).flatMap((g) => g.members))]
    : [];
  const sharedArtists = members
    .flatMap((m) => m.artists.slice(0, 2).map((a) => a.value))
    .slice(0, 4);
  const allMemberGenres = [...new Set(members.flatMap(m => (m.genres ?? []).map(g => g.value)))];

  // Task A: Trending tracks (runs in parallel)
  const trendingPromise = trendingCount > 0
    ? getTrendingTracks(accessToken, trendingCount, mode)
    : Promise.resolve([] as GeneratedTrack[]);

  // Task B: Shared taste via Last.fm (runs in parallel)
  const sharedLastfmPromise = (sharedCount > 0 && sharedGenres.length > 0 && useLastfm && sharedArtists.length > 0)
    ? discoverViaLastfm(
        sharedArtists.slice(0, 3),
        accessToken,
        sharedCount,
        `🤝 Gemensam smak: ${sharedGenres.slice(0, 2).map(g => g.genre).join(", ")}`,
        memberNames,
        allMemberGenres
      )
    : Promise.resolve([] as GeneratedTrack[]);

  // Task C: Individual member discovery via Last.fm (all members in parallel)
  const individualPromises = members.map(async (member) => {
    const memberGenres = (member.genres ?? []).map(g => g.value);
    const memberArtists = member.artists.slice(0, 3).map((a) => a.value);
    if (memberGenres.length === 0 && memberArtists.length === 0) return [] as GeneratedTrack[];

    const tracks: GeneratedTrack[] = [];

    if (useLastfm && memberArtists.length > 0) {
      const artistLabel = memberArtists[0] ?? "musik";
      const discovered = await discoverViaLastfm(
        memberArtists.slice(0, 2),
        accessToken,
        perMemberCount,
        `🎵 ${member.displayName} gillar ${artistLabel}`,
        [member.displayName],
        memberGenres
      );
      tracks.push(...discovered);
    }

    // Fill remaining with Spotify recommendations
    if (tracks.length < perMemberCount) {
      const needed = perMemberCount - tracks.length;
      const shuffledGenres = shuffle(memberGenres);
      const genreGroups = shuffledGenres.length > 0 ? shuffledGenres : ["pop"];
      const perGenre = Math.max(1, Math.ceil(needed / Math.min(genreGroups.length, 4)));
      const existingIds = new Set(tracks.map(t => t.id));

      // Parallelize genre-based recommendations
      const genreResults = await Promise.all(
        genreGroups.slice(0, 4).map(async (genre) => {
          const modeGenres = MODE_CONFIGS[mode].tags;
          const seedGenres = mode !== "mixed" ? [genre, ...modeGenres.slice(0, 1)] : [genre];
          return getRecommendations({
            seedGenres: seedGenres.slice(0, Math.max(1, 5 - memberArtists.length)),
            seedArtists: memberArtists.slice(0, 2),
            limit: perGenre + 2,
            accessToken,
          }).then(recs => recs.map(t => ({
            ...t,
            reason: `🎹 ${member.displayName}s ${genre}`,
            forMembers: [member.displayName],
          } as GeneratedTrack)));
        })
      );

      let added = 0;
      for (const recs of genreResults) {
        for (const t of recs) {
          if (tracks.length >= perMemberCount) break;
          if (existingIds.has(t.id)) continue;
          existingIds.add(t.id);
          tracks.push(t);
          added++;
        }
        if (added >= needed) break;
      }
    }

    return tracks;
  });

  // === AWAIT ALL IN PARALLEL ===
  const [trendingTracks, sharedTracks, ...individualResults] = await Promise.all([
    trendingPromise,
    sharedLastfmPromise,
    ...individualPromises,
  ]);

  // === MERGE RESULTS (dedup by track ID) ===
  const result: GeneratedTrack[] = [];

  // Add trending
  for (const t of trendingTracks) {
    if (!usedTrackIds.has(t.id)) {
      usedTrackIds.add(t.id);
      result.push(t);
    }
  }

  // Add shared taste
  for (const t of sharedTracks) {
    if (result.length >= trendingCount + sharedCount) break;
    if (!usedTrackIds.has(t.id)) {
      usedTrackIds.add(t.id);
      result.push(t);
    }
  }

  // Fill shared with Spotify recommendations if needed
  const currentShared = result.length - trendingTracks.length;
  if (currentShared < sharedCount && sharedGenres.length > 0) {
    const seedGenres = sharedGenres.slice(0, 3).map((g) => g.genre);
    const seedArtistsList = sharedArtists.slice(0, 2);
    const modeGenres = MODE_CONFIGS[mode].tags;
    const combinedGenres = mode !== "mixed"
      ? [...modeGenres.slice(0, 2), ...seedGenres.slice(0, 1)]
      : seedGenres;

    const tracks = await getRecommendations({
      seedGenres: combinedGenres.slice(0, Math.max(1, 5 - seedArtistsList.length)),
      seedArtists: seedArtistsList,
      limit: sharedCount - currentShared,
      accessToken,
    });
    for (const t of tracks) {
      if (result.length >= trendingCount + sharedCount) break;
      if (!usedTrackIds.has(t.id)) {
        usedTrackIds.add(t.id);
        result.push({
          ...t,
          reason: `🤝 Gemensam: ${seedGenres.slice(0, 2).join(", ")}`,
          forMembers: memberNames,
        });
      }
    }
  }

  // Add individual member tracks
  for (const memberTracks of individualResults) {
    for (const t of memberTracks) {
      if (!usedTrackIds.has(t.id)) {
        usedTrackIds.add(t.id);
        result.push(t);
      }
    }
  }

  // Task 5: Enforce artist diversity
  let filtered = enforceArtistDiversity(result);

  // Mode-based energy filtering via Spotify Audio Features
  if (mode !== "mixed" && filtered.length > 0) {
    try {
      const features = await getAudioFeatures(accessToken, filtered.map(t => t.id));
      filtered = filterByModeEnergy(filtered, features, mode);
    } catch (e) {
      console.warn("Audio features fetch failed, skipping energy filter:", e);
    }
  }

  return filtered;
}

/**
 * Filter tracks by energy/danceability based on playlist mode.
 * Removes tracks that clearly don't fit the mode's vibe.
 * Keeps at least 60% of tracks to avoid empty playlists.
 */
function filterByModeEnergy(
  tracks: GeneratedTrack[],
  features: Map<string, AudioFeatures>,
  mode: PlaylistMode
): GeneratedTrack[] {
  const minKeep = Math.ceil(tracks.length * 0.6);

  const scored = tracks.map(t => {
    const af = features.get(t.id);
    if (!af) return { track: t, score: 0.5 }; // No data → neutral

    let score: number;
    switch (mode) {
      case "party":
        // High energy + danceability
        score = af.energy * 0.5 + af.danceability * 0.4 + af.valence * 0.1;
        break;
      case "dinner":
        // Low energy, acoustic, calm
        score = (1 - af.energy) * 0.4 + af.acousticness * 0.3 + (1 - af.danceability) * 0.3;
        break;
      case "background":
        // Low energy, possibly instrumental
        score = (1 - af.energy) * 0.3 + af.instrumentalness * 0.3 + af.acousticness * 0.2 + (1 - af.danceability) * 0.2;
        break;
      case "workout":
        // High energy + tempo
        score = af.energy * 0.5 + af.danceability * 0.3 + Math.min(1, af.tempo / 150) * 0.2;
        break;
      default:
        score = 0.5;
    }
    return { track: t, score };
  });

  // Sort by mode fitness, keep the best ones
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(minKeep, tracks.length)).map(s => s.track);
}
