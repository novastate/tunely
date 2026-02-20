"use client";

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

interface RoomListItem {
  id: string;
  name: string;
  code: string;
  _count: { queue: number; members: number };
}

export default function AppPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [newName, setNewName] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
    if (session && !session.user.onboarded) router.push("/onboarding");
  }, [session, status, router]);

  const loadRooms = useCallback(async () => {
    const res = await fetch("/api/rooms");
    if (res.ok) setRooms(await res.json());
  }, []);

  useEffect(() => { if (session) loadRooms(); }, [session, loadRooms]);

  const createRoom = async () => {
    if (!newName.trim()) return;
    setError("");
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), visibility }),
    });
    if (res.ok) {
      const room = await res.json();
      router.push(`/room/${room.id}`);
    }
  };

  const joinRoom = async () => {
    if (!joinCode.trim()) return;
    setError("");
    const res = await fetch("/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: joinCode.trim() }),
    });
    if (res.ok) {
      const room = await res.json();
      router.push(`/room/${room.id}`);
    } else {
      setError("Rum hittades inte");
    }
  };

  if (status === "loading" || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1db954] text-sm">🎵</div>
          <h1 className="text-xl font-bold sm:text-2xl">Musikrum</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden text-sm text-zinc-500 sm:inline">{session.user.name}</span>
          <button onClick={() => router.push("/friends")} className="rounded-lg bg-[#1a1a1a] px-3 py-2 text-sm transition-colors hover:bg-[#2a2a2a]">👥 Vänner</button>
          <button onClick={() => router.push("/profile")} className="rounded-lg bg-[#1a1a1a] px-3 py-2 text-sm transition-colors hover:bg-[#2a2a2a]">Profil</button>
          <button onClick={() => signOut({ callbackUrl: "/" })} className="rounded-lg bg-[#1a1a1a] px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-[#2a2a2a] hover:text-white">Logga ut</button>
        </div>
      </header>

      {/* Create / Join */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800/50 bg-[#1a1a1a] p-6 transition-colors hover:border-zinc-700">
          <h2 className="text-lg font-semibold mb-3">Skapa rum</h2>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Rumsnamn..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm placeholder-zinc-500 focus:border-green-500 focus:outline-none"
            onKeyDown={(e) => e.key === "Enter" && createRoom()}
          />
          <div className="mt-3 flex gap-2">
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "private" | "public")}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-green-500 focus:outline-none"
            >
              <option value="private">🔒 Privat</option>
              <option value="public">🌐 Publikt</option>
            </select>
            <button onClick={createRoom} className="flex-1 rounded-lg bg-[#1db954] py-2.5 text-sm font-medium text-black transition hover:bg-[#1ed760]">
              Skapa rum
            </button>
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-800/50 bg-[#1a1a1a] p-6 transition-colors hover:border-zinc-700">
          <h2 className="text-lg font-semibold mb-3">Gå med i rum</h2>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Rumskod (t.ex. ABC12)..."
            maxLength={6}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm uppercase tracking-widest placeholder-zinc-500 focus:border-green-500 focus:outline-none"
            onKeyDown={(e) => e.key === "Enter" && joinRoom()}
          />
          <button onClick={joinRoom} className="mt-3 w-full rounded-lg bg-zinc-700 py-2 text-sm font-medium hover:bg-zinc-600 transition">
            Gå med
          </button>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </div>
      </section>

      {/* Room list */}
      {rooms.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-3">Dina rum</h2>
          <ul className="space-y-2">
            {rooms.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => router.push(`/room/${r.id}`)}
                  className="w-full flex items-center justify-between rounded-xl border border-zinc-800/50 bg-[#1a1a1a] p-4 text-left transition-all duration-200 hover:bg-[#1a1a1a]/80 hover:border-zinc-700"
                >
                  <div>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-zinc-500">Kod: {r.code}</p>
                  </div>
                  <div className="text-right text-sm text-zinc-400">
                    <p>{r._count.queue} låtar</p>
                    <p>{r._count.members} medlemmar</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
