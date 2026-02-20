import { getRecommendations, SpotifyTrack, searchArtists, getAudioFeatures, AudioFeatures } from "./spotify";
import * as lastfm from "./lastfm";
import { isNameMatch, genreAffinity, MIN_GENRE_AFFINITY } from "./discovery-filters";

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
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=5`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
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

  for (const artist of artists) {
    if (results.length >= limit) break;

    const similarArtists = await lastfm.getSimilarArtists(artist, 8);
    
    // Verify & rank similar artists by genre affinity to user's taste
    const scored: { name: string; affinity: number }[] = [];
    for (const sim of similarArtists) {
      // Skip fuzzy name collisions: "DJO" should not match "Djojji"
      if (isNameMatch(artist, sim.name) && sim.name.toLowerCase() !== artist.toLowerCase()) {
        continue;
      }
      
      // Verify on Spotify — check name match and genre affinity
      const spotifyResults = await searchArtists(accessToken, sim.name, 1);
      if (spotifyResults.length > 0) {
        const sa = spotifyResults[0];
        if (!isNameMatch(sim.name, sa.name)) continue;
        
        // Score by genre overlap with user's profile
        const affinity = userGenres.length > 0
          ? genreAffinity(userGenres, sa.genres)
          : 1; // No user genres → accept all (backwards compat)
        
        if (affinity >= MIN_GENRE_AFFINITY) {
          scored.push({ name: sa.name, affinity });
        }
      }
      if (scored.length >= 5) break;
    }
    
    // Sort by affinity — most genre-aligned first
    scored.sort((a, b) => b.affinity - a.affinity);
    const verifiedSimilar = scored.slice(0, 3).map(s => s.name);
    
    const artistsToFetch = [artist, ...verifiedSimilar].slice(0, 4);

    for (const fetchArtist of artistsToFetch) {
      if (results.length >= limit) break;
      const topTracks = await lastfm.getTopTracks(fetchArtist, 3);

      for (const t of topTracks) {
        if (results.length >= limit) break;
        const spotifyTrack = await searchSpotifyTrack(t.name, t.artist.name, accessToken);
        if (spotifyTrack && !usedIds.has(spotifyTrack.id)) {
          usedIds.add(spotifyTrack.id);
          const isDiscovery = fetchArtist !== artist;
          results.push({
            ...spotifyTrack,
            reason: isDiscovery
              ? `🔍 Liknande ${artist}`
              : reason,
            forMembers,
          });
        }
      }
    }
  }

  return results;
}

/**
 * Task 3: Get trending tracks from Last.fm charts, resolved on Spotify.
 */
async function getTrendingTracks(
  accessToken: string,
  limit: number,
  mode: PlaylistMode
): Promise<GeneratedTrack[]> {
  const results: GeneratedTrack[] = [];
  const usedIds = new Set<string>();

  if (!lastfm.isAvailable()) return results;

  // If mode has tags, get tracks by tag; otherwise chart top tracks
  const config = MODE_CONFIGS[mode];
  let lfmTracks: lastfm.LastfmTrack[] = [];

  if (mode !== "mixed" && config.tags.length > 0) {
    // Get from mode-specific tags
    for (const tag of config.tags.slice(0, 2)) {
      const tagTracks = await lastfm.getTagTopTracks(tag, 5);
      lfmTracks.push(...tagTracks);
      if (lfmTracks.length >= limit * 2) break;
    }
  } else {
    lfmTracks = await lastfm.getChartTopTracks(limit * 2);
  }

  // Shuffle to avoid always getting the same trending tracks
  lfmTracks = shuffle(lfmTracks);

  for (const t of lfmTracks) {
    if (results.length >= limit) break;
    const spotifyTrack = await searchSpotifyTrack(t.name, t.artist.name, accessToken);
    if (spotifyTrack && !usedIds.has(spotifyTrack.id)) {
      usedIds.add(spotifyTrack.id);
      results.push({
        ...spotifyTrack,
        reason: mode !== "mixed"
          ? `🔥 Trending (${config.label})`
          : "🔥 Trending",
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

  const result: GeneratedTrack[] = [];
  const usedTrackIds = new Set<string>();

  // --- Task 3: Trending tracks ---
  if (trendingCount > 0) {
    const trending = await getTrendingTracks(accessToken, trendingCount, mode);
    for (const t of trending) {
      if (!usedTrackIds.has(t.id)) {
        usedTrackIds.add(t.id);
        result.push(t);
      }
    }
  }

  // --- Shared taste tracks ---
  if (sharedCount > 0 && sharedGenres.length > 0) {
    const memberNames = [
      ...new Set(sharedGenres.slice(0, 3).flatMap((g) => g.members)),
    ];
    const sharedArtists = members
      .flatMap((m) => m.artists.slice(0, 2).map((a) => a.value))
      .slice(0, 4);

    if (useLastfm && sharedArtists.length > 0) {
      // Collect all member genres for affinity scoring
      const allMemberGenres = [...new Set(members.flatMap(m => (m.genres ?? []).map(g => g.value)))];
      const discovered = await discoverViaLastfm(
        sharedArtists.slice(0, 3),
        accessToken,
        sharedCount,
        `🤝 Gemensam smak: ${sharedGenres.slice(0, 2).map(g => g.genre).join(", ")}`,
        memberNames,
        allMemberGenres
      );
      for (const t of discovered) {
        if (result.length >= trendingCount + sharedCount) break;
        if (!usedTrackIds.has(t.id)) {
          usedTrackIds.add(t.id);
          result.push(t);
        }
      }
    }

    // Fill with Spotify search fallback
    const currentShared = result.length - trendingCount;
    if (currentShared < sharedCount) {
      const seedGenres = sharedGenres.slice(0, 3).map((g) => g.genre);
      const seedArtists = sharedArtists.slice(0, 2);

      // Task 4: Add mode-specific genre bias
      const modeGenres = MODE_CONFIGS[mode].tags;
      const combinedGenres = mode !== "mixed"
        ? [...modeGenres.slice(0, 2), ...seedGenres.slice(0, 1)]
        : seedGenres;

      const tracks = await getRecommendations({
        seedGenres: combinedGenres.slice(0, Math.max(1, 5 - seedArtists.length)),
        seedArtists,
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
  }

  // --- Individual picks per member (Task 5: use ALL genres, shuffled) ---
  for (const member of members) {
    // Task 5: Use ALL genres from member, not just top 1-2
    const memberGenres = (member.genres ?? []).map(g => g.value);
    const shuffledGenres = shuffle(memberGenres);

    // Distribute picks across multiple genre groups
    const memberArtists = member.artists.slice(0, 3).map((a) => a.value);
    if (shuffledGenres.length === 0 && memberArtists.length === 0) continue;

    let added = 0;

    // Try Last.fm discovery first
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
      for (const t of discovered) {
        if (added >= perMemberCount) break;
        if (!usedTrackIds.has(t.id)) {
          usedTrackIds.add(t.id);
          result.push(t);
          added++;
        }
      }
    }

    // Fill remaining with Spotify search — rotate through ALL genres
    if (added < perMemberCount) {
      const needed = perMemberCount - added;
      // Split needed tracks across genre groups
      const genreGroups = shuffledGenres.length > 0
        ? shuffledGenres
        : ["pop"]; // fallback

      const perGenre = Math.max(1, Math.ceil(needed / Math.min(genreGroups.length, 4)));

      for (let gi = 0; gi < Math.min(genreGroups.length, 4) && added < perMemberCount; gi++) {
        const genre = genreGroups[gi];

        // Task 4: Combine with mode tags
        const modeGenres = MODE_CONFIGS[mode].tags;
        const seedGenres = mode !== "mixed"
          ? [genre, ...modeGenres.slice(0, 1)]
          : [genre];

        const tracks = await getRecommendations({
          seedGenres: seedGenres.slice(0, Math.max(1, 5 - memberArtists.length)),
          seedArtists: memberArtists.slice(0, 2),
          limit: perGenre + 2,
          accessToken,
        });

        for (const t of tracks) {
          if (added >= perMemberCount) break;
          if (usedTrackIds.has(t.id)) continue;
          usedTrackIds.add(t.id);
          result.push({
            ...t,
            reason: `🎹 ${member.displayName}s ${genre}`,
            forMembers: [member.displayName],
          });
          added++;
        }
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
