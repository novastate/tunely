"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

const FALLBACK_GENRES = [
  "Pop", "Rock", "Hip-Hop", "R&B", "Electronic", "Jazz",
  "Classical", "Country", "Metal", "Indie", "Latin", "Folk",
  "Reggaeton", "Punk", "Blues", "Soul", "Funk", "Ambient",
  "House", "Techno", "Disco", "Trap", "Ska", "Grunge",
];

interface SpotifyArtistSuggestion {
  id: string;
  name: string;
  image: string | null;
}

export default function OnboardingPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Genre state
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [spotifyGenres, setSpotifyGenres] = useState<string[]>([]);

  // Artist state — store both name and Spotify ID
  const [selectedArtists, setSelectedArtists] = useState<string[]>([]);
  const [artistIdMap, setArtistIdMap] = useState<Record<string, string>>({});
  const [spotifyArtists, setSpotifyArtists] = useState<SpotifyArtistSuggestion[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SpotifyArtistSuggestion[]>([]);
  const [searching, setSearching] = useState(false);

  const [saving, setSaving] = useState(false);
  const [loadingSpotify, setLoadingSpotify] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  // Fetch Spotify top data
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/spotify/top")
      .then((r) => r.ok ? r.json() : { artists: [], genres: [] })
      .then((data) => {
        setSpotifyGenres(data.genres ?? []);
        setSpotifyArtists(data.artists ?? []);
        // Pre-select top 5 genres
        setSelectedGenres((data.genres ?? []).slice(0, 5));
        // Pre-select top 5 artists and build ID map
        const topArtists = (data.artists ?? []).slice(0, 5);
        setSelectedArtists(topArtists.map((a: SpotifyArtistSuggestion) => a.name));
        const idMap: Record<string, string> = {};
        for (const a of (data.artists ?? []) as SpotifyArtistSuggestion[]) {
          idMap[a.name] = a.id;
        }
        setArtistIdMap(prev => ({ ...prev, ...idMap }));
      })
      .finally(() => setLoadingSpotify(false));
  }, [status]);

  // Artist search with debounce
  const searchArtists = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.artists ?? []);
        // Track IDs for search results too
        const idMap: Record<string, string> = {};
        for (const a of (data.artists ?? []) as SpotifyArtistSuggestion[]) {
          idMap[a.name] = a.id;
        }
        setArtistIdMap(prev => ({ ...prev, ...idMap }));
      }
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchArtists(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchArtists]);

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const toggleArtist = (name: string) => {
    setSelectedArtists((prev) =>
      prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]
    );
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          genres: selectedGenres,
          artists: selectedArtists,
          artistIds: selectedArtists.map(name => artistIdMap[name]).filter(Boolean),
        }),
      });
      if (!res.ok) {
        console.error("Onboarding save failed:", res.status);
        setSaving(false);
        return;
      }
      // Force session refresh so JWT picks up onboarded=true
      await update();
      router.push("/app");
    } catch (err) {
      console.error("Onboarding error:", err);
      setSaving(false);
    }
  };

  if (status === "loading" || !session) return null;

  // Merge genres: Spotify top + fallbacks (deduplicated)
  const allGenres = [
    ...spotifyGenres.slice(0, 15),
    ...FALLBACK_GENRES.filter(
      (g) => !spotifyGenres.some((sg) => sg.toLowerCase() === g.toLowerCase())
    ),
  ];

  const capitalize = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <main className="mx-auto max-w-lg p-8">
      {/* Progress bar */}
      <div className="mb-8 flex gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-[#1db954] transition-all duration-500 ease-out"
              style={{ width: s <= step ? "100%" : "0%" }}
            />
          </div>
        ))}
      </div>
      <p className="mb-6 text-xs text-zinc-600">Steg {step} av 3</p>

      {step === 1 && (
        <section>
          <h1 className="text-3xl font-bold">🎵 Välj dina favoritgenrer</h1>
          <p className="mt-2 text-zinc-400">
            Välj minst 3 genrer. Vi har föreslått utifrån din Spotify-historik.
          </p>
          {loadingSpotify ? (
            <div className="mt-8 flex justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
            </div>
          ) : (
            <div className="mt-6 flex flex-wrap gap-2">
              {allGenres.map((genre) => (
                <button
                  key={genre}
                  onClick={() => toggleGenre(genre)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
                    selectedGenres.includes(genre)
                      ? "bg-[#1db954] text-black shadow-md shadow-[#1db954]/20 scale-105"
                      : "bg-[#2a2a2a] text-zinc-300 hover:bg-zinc-700 hover:scale-[1.02]"
                  }`}
                >
                  {capitalize(genre)}
                </button>
              ))}
            </div>
          )}
          <p className="mt-4 text-sm text-zinc-500">
            {selectedGenres.length} valda {selectedGenres.length < 3 && "(minst 3)"}
          </p>
          <button
            onClick={() => setStep(2)}
            disabled={selectedGenres.length < 3}
            className="mt-6 w-full rounded-full bg-green-500 py-3 font-semibold text-black transition hover:bg-green-400 disabled:opacity-50"
          >
            Nästa →
          </button>
        </section>
      )}

      {step === 2 && (
        <section>
          <h1 className="text-3xl font-bold">🎤 Välj favoritartister</h1>
          <p className="mt-2 text-zinc-400">
            Vi föreslår dina mest spelade. Sök för att lägga till fler.
          </p>

          {/* Search */}
          <div className="mt-6">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Sök artister på Spotify..."
              className="w-full rounded-lg bg-zinc-800 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-500"
            />
            {searching && (
              <p className="mt-2 text-sm text-zinc-500">Söker...</p>
            )}
            {searchResults.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {searchResults.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => toggleArtist(a.name)}
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition ${
                      selectedArtists.includes(a.name)
                        ? "bg-green-500 text-black"
                        : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    {a.image && (
                      <img src={a.image} alt="" className="h-6 w-6 rounded-full object-cover" />
                    )}
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Spotify suggestions */}
          {spotifyArtists.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-zinc-400">Från din Spotify</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {spotifyArtists.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => toggleArtist(a.name)}
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition ${
                      selectedArtists.includes(a.name)
                        ? "bg-green-500 text-black"
                        : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    {a.image && (
                      <img src={a.image} alt="" className="h-6 w-6 rounded-full object-cover" />
                    )}
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected */}
          {selectedArtists.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-zinc-400">
                Valda ({selectedArtists.length})
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedArtists.map((name) => (
                  <span
                    key={name}
                    className="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-sm text-green-400"
                  >
                    {name}
                    <button
                      onClick={() => toggleArtist(name)}
                      className="ml-1 hover:text-white"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex-1 rounded-full bg-zinc-800 py-3 font-semibold transition hover:bg-zinc-700"
            >
              ← Tillbaka
            </button>
            <button
              onClick={() => setStep(3)}
              className="flex-1 rounded-full bg-green-500 py-3 font-semibold text-black transition hover:bg-green-400"
            >
              Nästa →
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section>
          <h1 className="text-3xl font-bold">✅ Din musikprofil</h1>
          <p className="mt-2 text-zinc-400">
            Ser detta rätt ut? Du kan alltid ändra i din profil sen.
          </p>

          <div className="mt-6 space-y-6">
            <div>
              <h3 className="text-sm font-medium text-zinc-400">Genrer</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedGenres.map((g) => (
                  <span key={g} className="rounded-full bg-green-500/20 px-3 py-1 text-sm text-green-400">
                    {capitalize(g)}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-zinc-400">Artister</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedArtists.length > 0 ? (
                  selectedArtists.map((a) => (
                    <span key={a} className="rounded-full bg-green-500/20 px-3 py-1 text-sm text-green-400">
                      {a}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-zinc-500">Inga artister valda</span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="flex-1 rounded-full bg-zinc-800 py-3 font-semibold transition hover:bg-zinc-700"
            >
              ← Tillbaka
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 rounded-full bg-green-500 py-3 font-semibold text-black transition hover:bg-green-400 disabled:opacity-50"
            >
              {saving ? "Sparar..." : "Klar! 🎉"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
