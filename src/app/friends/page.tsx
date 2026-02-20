"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

interface Friend {
  id: string;
  friendName: string;
  spotifyId: string | null;
  email: string | null;
  createdAt: string;
}

export default function FriendsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [name, setName] = useState("");
  const [spotifyId, setSpotifyId] = useState("");
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  const loadFriends = useCallback(async () => {
    const res = await fetch("/api/friends");
    if (res.ok) setFriends(await res.json());
  }, []);

  useEffect(() => { if (session) loadFriends(); }, [session, loadFriends]);

  const addFriend = async () => {
    if (!name.trim()) return;
    setAdding(true);
    const res = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendName: name, spotifyId: spotifyId || null, email: email || null }),
    });
    if (res.ok) {
      setName(""); setSpotifyId(""); setEmail(""); setShowForm(false);
      loadFriends();
    }
    setAdding(false);
  };

  const removeFriend = async (id: string) => {
    await fetch(`/api/friends/${id}`, { method: "DELETE" });
    loadFriends();
  };

  if (status === "loading" || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1db954] border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <button onClick={() => router.push("/app")} className="text-sm text-zinc-500 hover:text-white transition">
            ← Tillbaka
          </button>
          <h1 className="text-xl font-bold">Vänner</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-xl bg-[#1db954] px-4 py-2 text-sm font-medium text-black transition hover:bg-[#1ed760]"
        >
          {showForm ? "Avbryt" : "+ Lägg till vän"}
        </button>
      </header>

      {showForm && (
        <div className="mb-6 rounded-2xl border border-zinc-800 bg-[#1a1a1a] p-5 animate-fade-in-up">
          <div className="space-y-3">
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Namn *"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm placeholder-zinc-500 focus:border-[#1db954] focus:outline-none"
            />
            <input
              value={spotifyId} onChange={(e) => setSpotifyId(e.target.value)}
              placeholder="Spotify-användarnamn (valfritt)"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm placeholder-zinc-500 focus:border-[#1db954] focus:outline-none"
            />
            <input
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (valfritt)"
              type="email"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm placeholder-zinc-500 focus:border-[#1db954] focus:outline-none"
            />
            <button
              onClick={addFriend} disabled={adding || !name.trim()}
              className="w-full rounded-xl bg-[#1db954] py-2.5 text-sm font-medium text-black transition hover:bg-[#1ed760] disabled:opacity-50"
            >
              {adding ? "Lägger till..." : "Lägg till"}
            </button>
          </div>
        </div>
      )}

      {friends.length === 0 ? (
        <div className="py-16 text-center">
          <div className="text-4xl mb-3">👥</div>
          <p className="text-zinc-500">Inga vänner ännu. Lägg till dina musikvänner!</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {friends.map((f) => (
            <li key={f.id} className="flex items-center justify-between rounded-xl border border-zinc-800/50 bg-[#1a1a1a] p-4 transition hover:border-zinc-700">
              <div>
                <p className="font-medium">{f.friendName}</p>
                <div className="flex gap-3 text-xs text-zinc-500">
                  {f.spotifyId && <span>🎵 {f.spotifyId}</span>}
                  {f.email && <span>📧 {f.email}</span>}
                </div>
              </div>
              <button onClick={() => removeFriend(f.id)} className="rounded-lg px-3 py-1.5 text-sm text-red-400 transition hover:bg-red-500/10">
                Ta bort
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
