"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useUserProfile } from "@/hooks/useUserProfile";

const ALL_GENRES = [
  "Pop", "Rock", "Hip-Hop", "R&B", "Electronic", "Jazz",
  "Classical", "Country", "Metal", "Indie", "Latin", "Folk",
  "Reggaeton", "Punk", "Blues", "Soul", "Funk", "Ambient",
  "House", "Techno", "Disco", "Trap",
];

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { profile, loading, refetch } = useUserProfile();

  const [editing, setEditing] = useState(false);
  const [genres, setGenres] = useState<string[]>([]);
  const [artists, setArtists] = useState<string[]>([]);
  const [artistInput, setArtistInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  useEffect(() => {
    if (profile) {
      setGenres(profile.genres ?? []);
      setArtists(profile.artists ?? []);
    }
  }, [profile]);

  const toggleGenre = (g: string) => {
    setGenres((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);
  };

  const addArtist = () => {
    const name = artistInput.trim();
    if (name && !artists.includes(name)) {
      setArtists((prev) => [...prev, name]);
      setArtistInput("");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genres, artists }),
      });
      await refetch();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  const capitalize = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <main className="mx-auto max-w-lg p-8">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/app")}
          className="text-sm text-zinc-400 hover:text-white"
        >
          ← Tillbaka
        </button>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-sm text-zinc-400 hover:text-white"
        >
          Logga ut
        </button>
      </div>

      {/* Profile header */}
      <div className="mt-8 flex items-center gap-4">
        {profile?.imageUrl ? (
          <img
            src={profile.imageUrl}
            alt=""
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 text-2xl">
            🎵
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold">{profile?.displayName}</h1>
          {profile?.email && (
            <p className="text-sm text-zinc-400">{profile.email}</p>
          )}
        </div>
      </div>

      {/* Preferences */}
      <div className="mt-8 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Musikpreferenser</h2>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg bg-zinc-800 px-4 py-1.5 text-sm hover:bg-zinc-700"
            >
              Redigera
            </button>
          )}
        </div>

        {editing ? (
          <>
            {/* Genre editing */}
            <div>
              <h3 className="text-sm font-medium text-zinc-400">Genrer</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {ALL_GENRES.map((g) => (
                  <button
                    key={g}
                    onClick={() => toggleGenre(g)}
                    className={`rounded-full px-3 py-1 text-sm transition ${
                      genres.includes(g)
                        ? "bg-green-500 text-black"
                        : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Artist editing */}
            <div>
              <h3 className="text-sm font-medium text-zinc-400">Artister</h3>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={artistInput}
                  onChange={(e) => setArtistInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addArtist()}
                  placeholder="Lägg till artist..."
                  className="flex-1 rounded-lg bg-zinc-800 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  onClick={addArtist}
                  className="rounded-lg bg-zinc-700 px-4 py-2 text-sm hover:bg-zinc-600"
                >
                  +
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {artists.map((a) => (
                  <span
                    key={a}
                    className="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-sm text-green-400"
                  >
                    {a}
                    <button
                      onClick={() => setArtists((prev) => prev.filter((x) => x !== a))}
                      className="ml-1 hover:text-white"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setEditing(false);
                  if (profile) {
                    setGenres(profile.genres ?? []);
                    setArtists(profile.artists ?? []);
                  }
                }}
                className="flex-1 rounded-full bg-zinc-800 py-2.5 text-sm font-semibold hover:bg-zinc-700"
              >
                Avbryt
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-full bg-green-500 py-2.5 text-sm font-semibold text-black hover:bg-green-400 disabled:opacity-50"
              >
                {saving ? "Sparar..." : "Spara"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <h3 className="text-sm font-medium text-zinc-400">Genrer</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {profile?.genres?.length ? (
                  profile.genres.map((g) => (
                    <span key={g} className="rounded-full bg-green-500/20 px-3 py-1 text-sm text-green-400">
                      {capitalize(g)}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-zinc-500">Inga genrer</span>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-zinc-400">Artister</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {profile?.artists.length ? (
                  profile.artists.map((a) => (
                    <span key={a} className="rounded-full bg-green-500/20 px-3 py-1 text-sm text-green-400">
                      {a}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-zinc-500">Inga artister</span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
