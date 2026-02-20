"use client";

import { useSession, signIn } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { useQueue, QueueItem } from "@/hooks/useQueue";
import { MiniPlayer } from "@/components/MiniPlayer";
import { RoomQRCode } from "@/components/RoomQRCode";
import { InviteFriends } from "@/components/InviteFriends";
import { getGuestFromCookies } from "@/lib/guest";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface GeneratedTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { name: string; images: { url: string }[] };
  duration_ms: number;
  reason: string;
  forMembers: string[];
}

/* ===== Skeleton Loader ===== */
function QueueSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-zinc-800/50 bg-[#1a1a1a] p-3">
          <div className="skeleton h-12 w-12 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-3/4 rounded" />
            <div className="skeleton h-3 w-1/2 rounded" />
          </div>
          <div className="skeleton h-8 w-16 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/* ===== Empty State ===== */
function EmptyQueue() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in-up">
      <div className="mb-4 text-5xl">🎵</div>
      <h3 className="text-lg font-semibold text-zinc-300">Kön är tom</h3>
      <p className="mt-1 text-sm text-zinc-500">Sök efter en låt eller generera en playlist!</p>
    </div>
  );
}

/* ===== Playlist Generator with Preview (Task 1 + Task 4) ===== */
function PlaylistGenerator({ roomId, onAddedToQueue }: { roomId: string; onAddedToQueue: () => void }) {
  const [tracks, setTracks] = useState<GeneratedTrack[]>([]);
  const [generating, setGenerating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState("mixed");
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setTracks([]);
    setSelectedTracks(new Set());
    setShowAll(false);
    try {
      const res = await fetch(`/api/rooms/${roomId}/generate-playlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, totalTracks: 30 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Kunde inte generera playlist");
      }
      const data = await res.json();
      setTracks(data.tracks);
      // Select all by default
      setSelectedTracks(new Set(data.tracks.map((t: GeneratedTrack) => t.id)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Något gick fel");
    } finally {
      setGenerating(false);
    }
  }, [roomId, mode]);

  const toggleTrack = (id: string) => {
    setSelectedTracks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedTracks.size === tracks.length) {
      setSelectedTracks(new Set());
    } else {
      setSelectedTracks(new Set(tracks.map(t => t.id)));
    }
  };

  const addSelectedToQueue = async () => {
    const toAdd = tracks.filter(t => selectedTracks.has(t.id));
    if (toAdd.length === 0) return;
    setAdding(true);
    for (const t of toAdd) {
      await fetch(`/api/rooms/${roomId}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId: t.id,
          trackName: t.name,
          artistName: t.artists.map((a) => a.name).join(", "),
          albumImage: t.album.images[0]?.url ?? null,
          durationMs: t.duration_ms,
        }),
      });
    }
    // Remove added tracks from preview
    setTracks(prev => prev.filter(t => !selectedTracks.has(t.id)));
    setSelectedTracks(new Set());
    setAdding(false);
    onAddedToQueue();
  };

  const memberSummary = tracks.reduce<Record<string, number>>((acc, t) => {
    for (const m of t.forMembers) {
      acc[m] = (acc[m] ?? 0) + 1;
    }
    return acc;
  }, {});

  return (
    <div className="mb-4">
      {/* Mode selector (Task 4) */}
      <div className="mb-3">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="w-full rounded-xl border border-zinc-800 bg-[#1a1a1a] px-4 py-2.5 text-sm text-white transition-colors focus:border-purple-500 focus:outline-none"
        >
          <option value="mixed">🎵 Blandat</option>
          <option value="dinner">🍽️ Dinner</option>
          <option value="party">🎉 Party</option>
          <option value="background">🎧 Background</option>
          <option value="workout">💪 Workout</option>
        </select>
      </div>

      <button
        onClick={generate}
        disabled={generating}
        className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-3.5 font-medium text-white shadow-lg shadow-purple-900/20 transition-all duration-200 hover:from-purple-500 hover:to-pink-500 hover:shadow-xl hover:shadow-purple-900/30 disabled:opacity-50 active:scale-[0.98]"
      >
        {generating ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Genererar playlist...
          </span>
        ) : (
          "✨ Generera playlist för alla"
        )}
      </button>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {/* Preview list (Task 1) */}
      {tracks.length > 0 && (
        <div className="mt-4 rounded-xl border border-zinc-800/50 bg-[#1a1a1a] p-4 animate-fade-in-up">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">🎶 Föreslagna låtar ({tracks.length})</h3>
            <span className="text-xs text-zinc-500">
              {selectedTracks.size} valda
            </span>
          </div>

          {Object.keys(memberSummary).length > 0 && (
            <p className="mb-3 text-sm text-zinc-500">
              {Object.entries(memberSummary)
                .map(([name, count]) => `${count} för ${name}`)
                .join(", ")}
            </p>
          )}

          {/* Action buttons */}
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              onClick={addSelectedToQueue}
              disabled={adding || selectedTracks.size === 0}
              className="rounded-lg bg-[#1db954] px-4 py-2 text-sm font-medium text-black transition hover:bg-[#1ed760] disabled:opacity-50"
            >
              {adding ? "Lägger till..." : `Lägg till valda (${selectedTracks.size})`}
            </button>
            <button
              onClick={toggleAll}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-700"
            >
              {selectedTracks.size === tracks.length ? "Avmarkera alla" : "Markera alla"}
            </button>
            <button
              onClick={generate}
              disabled={generating}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-50"
            >
              🔄 Generera fler
            </button>
          </div>

          {(() => {
            const INITIAL_SHOW = 10;
            const visibleTracks = showAll ? tracks : tracks.slice(0, INITIAL_SHOW);
            const hiddenCount = tracks.length - INITIAL_SHOW;
            return (
              <>
                <ul className="max-h-[500px] space-y-1.5 overflow-y-auto">
                  {visibleTracks.map((t) => (
                    <li
                      key={t.id}
                      onClick={() => toggleTrack(t.id)}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg p-2.5 transition-colors ${
                        selectedTracks.has(t.id)
                          ? "bg-[#1db954]/10 border border-[#1db954]/20"
                          : "bg-[#2a2a2a]/50 hover:bg-[#2a2a2a] border border-transparent"
                      }`}
                    >
                      {/* Checkbox */}
                      <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        selectedTracks.has(t.id)
                          ? "border-[#1db954] bg-[#1db954] text-black"
                          : "border-zinc-600"
                      }`}>
                        {selectedTracks.has(t.id) && (
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>

                      {t.album.images[0] && (
                        <img src={t.album.images[0].url} alt="" className="h-10 w-10 rounded-lg" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium">{t.name}</p>
                        <p className="truncate text-xs text-zinc-500">{t.artists.map((a) => a.name).join(", ")}</p>
                      </div>
                      <span className="max-w-[140px] shrink-0 truncate rounded-full bg-purple-500/15 px-2.5 py-0.5 text-xs text-purple-400" title={t.reason}>
                        {t.reason}
                      </span>
                    </li>
                  ))}
                </ul>
                {!showAll && hiddenCount > 0 && (
                  <button
                    onClick={() => setShowAll(true)}
                    className="mt-2 w-full rounded-lg bg-zinc-800/50 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                  >
                    Visa {hiddenCount} till...
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/* ===== Track Search ===== */
function TrackSearch({ roomId, onAdded }: { roomId: string; onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string; artists: string; albumImage: string | null; durationMs: number }[]
  >([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/spotify/search-tracks?q=${encodeURIComponent(query)}`);
        if (res.ok) { const d = await res.json(); setResults(d.tracks); }
      } catch {} finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  const addTrack = async (track: (typeof results)[0]) => {
    await fetch(`/api/rooms/${roomId}/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackId: track.id,
        trackName: track.name,
        artistName: track.artists,
        albumImage: track.albumImage,
        durationMs: track.durationMs,
      }),
    });
    onAdded();
    setQuery("");
    setResults([]);
  };

  return (
    <div className="mb-4">
      <div className="relative">
        <svg className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Sök låtar på Spotify..."
          className="w-full rounded-xl border border-zinc-800 bg-[#1a1a1a] py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-600 transition-colors focus:border-[#1db954] focus:outline-none"
        />
      </div>
      {searching && (
        <div className="mt-2 flex items-center gap-2 text-sm text-zinc-500">
          <div className="h-3 w-3 animate-spin rounded-full border border-zinc-500 border-t-transparent" />
          Söker...
        </div>
      )}
      {results.length > 0 && (
        <ul className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-zinc-800 bg-[#1a1a1a] animate-fade-in-up">
          {results.map((t) => (
            <li key={t.id} className="flex items-center gap-3 border-b border-zinc-800/50 p-3 transition-colors last:border-0 hover:bg-[#2a2a2a]/50">
              {t.albumImage && (
                <img src={t.albumImage} alt="" className="h-10 w-10 rounded-lg" />
              )}
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{t.name}</p>
                <p className="truncate text-xs text-zinc-500">{t.artists}</p>
              </div>
              <button
                onClick={() => addTrack(t)}
                className="shrink-0 rounded-lg bg-[#1db954] px-3 py-1.5 text-xs font-medium text-black transition hover:bg-[#1ed760] active:scale-95"
              >
                + Kö
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ===== Sortable Queue Item ===== */
function SortableQueueItem({ item, isOwn, hasVoted, onVote, onRemove, index }: { item: QueueItem; isOwn: boolean; hasVoted: boolean; onVote: () => void; onRemove: () => void; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    animationDelay: `${index * 50}ms`,
  };

  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-xl border border-zinc-800/50 bg-[#1a1a1a] p-3 transition-all duration-200 hover:bg-[#1a1a1a]/80 hover:border-zinc-700">
      {/* Drag handle */}
      <div {...attributes} {...listeners} className="cursor-grab touch-none text-zinc-600 hover:text-zinc-400 active:cursor-grabbing">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="3" r="1.5"/><circle cx="11" cy="3" r="1.5"/><circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/><circle cx="5" cy="13" r="1.5"/><circle cx="11" cy="13" r="1.5"/></svg>
      </div>
      {item.albumImage ? (
        <img src={item.albumImage} alt="" className="h-12 w-12 rounded-lg shadow-md" />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#2a2a2a] text-lg">🎵</div>
      )}
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium">{item.trackName}</p>
        <p className="truncate text-xs text-zinc-500">{item.artistName}</p>
        <p className="text-[11px] text-zinc-600">av {item.addedByName}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onVote}
          className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm transition-colors active:scale-95 ${
            hasVoted
              ? "bg-[#1db954]/20 text-[#1db954] border border-[#1db954]/30"
              : "bg-[#2a2a2a] hover:bg-zinc-700"
          }`}
        >
          <span className={hasVoted ? "text-[#1db954]" : "text-zinc-500"}>👍</span> {item.votes}
        </button>
        {isOwn && (
          <button
            onClick={onRemove}
            className="rounded-lg bg-red-500/10 px-2.5 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-500/20 active:scale-95"
          >
            ✕
          </button>
        )}
      </div>
    </li>
  );
}

/* ===== Main Room Page ===== */
/* ===== Guest Conversion Banner ===== */
function GuestConversionBanner() {
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [signupError, setSignupError] = useState("");
  const [signingUp, setSigningUp] = useState(false);

  const handleQuickSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSigningUp(true);
    setSignupError("");
    const form = new FormData(e.currentTarget);
    const name = form.get("name") as string;
    const email = form.get("email") as string;
    const password = form.get("password") as string;

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");
      
      // Auto sign in after signup
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.ok) {
        window.location.reload(); // Reload to get new session
      }
    } catch (err) {
      setSignupError(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setSigningUp(false);
    }
  };

  return (
    <>
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-4 mb-4 rounded-lg animate-fade-in-up">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-medium">🎵 Skapa konto för egna listor</h3>
            <p className="text-sm opacity-90">Spara vänner, skapa rum, och håll koll på historik</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => signIn("spotify")}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-medium text-sm transition"
            >
              🎵 Spotify
            </button>
            <button
              onClick={() => setShowSignupModal(true)}
              className="px-4 py-2 bg-white text-black hover:bg-gray-100 rounded font-medium text-sm transition"
            >
              ✉️ Email
            </button>
          </div>
        </div>
      </div>

      {showSignupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowSignupModal(false)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#141414] p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">Skapa konto</h2>
            <form onSubmit={handleQuickSignup} className="space-y-3">
              <input
                name="name"
                placeholder="Ditt namn"
                required
                className="w-full rounded-xl border border-zinc-800 bg-[#1a1a1a] px-4 py-3 text-white placeholder-zinc-500 focus:border-[#1db954] focus:outline-none"
              />
              <input
                name="email"
                type="email"
                placeholder="Email"
                required
                className="w-full rounded-xl border border-zinc-800 bg-[#1a1a1a] px-4 py-3 text-white placeholder-zinc-500 focus:border-[#1db954] focus:outline-none"
              />
              <input
                name="password"
                type="password"
                placeholder="Lösenord (minst 6 tecken)"
                required
                minLength={6}
                className="w-full rounded-xl border border-zinc-800 bg-[#1a1a1a] px-4 py-3 text-white placeholder-zinc-500 focus:border-[#1db954] focus:outline-none"
              />
              {signupError && <p className="text-sm text-red-400">{signupError}</p>}
              <button
                type="submit"
                disabled={signingUp}
                className="w-full rounded-xl bg-[#1db954] py-3 font-semibold text-black transition hover:bg-[#1ed760] disabled:opacity-50"
              >
                {signingUp ? "Skapar..." : "Skapa konto"}
              </button>
            </form>
            <p className="text-sm text-zinc-400 mt-4 text-center">
              Eller{" "}
              <button onClick={() => signIn("spotify")} className="text-[#1db954] hover:underline">
                logga in med Spotify
              </button>
            </p>
            <button onClick={() => setShowSignupModal(false)} className="mt-3 w-full text-sm text-zinc-500 hover:text-white transition">
              Stäng
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ===== Friend Request Notification ===== */
function FriendRequestNotifications({ guestId }: { guestId?: string }) {
  const [requests, setRequests] = useState<Array<{ id: string; fromUser: { name: string } }>>([]);
  const { data: session } = useSession();

  useEffect(() => {
    const url = session?.user?.id
      ? "/api/friends/requests?type=received"
      : guestId
      ? `/api/friends/requests?guestId=${guestId}`
      : null;
    if (!url) return;
    fetch(url)
      .then((r) => r.ok ? r.json() : [])
      .then(setRequests)
      .catch(() => {});
  }, [session, guestId]);

  const handleAction = async (id: string, action: "accept" | "reject") => {
    await fetch(`/api/friends/request/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setRequests((prev) => prev.filter((r) => r.id !== id));
  };

  if (requests.length === 0) return null;

  const isGuest = !session?.user?.id;

  if (isGuest) {
    return (
      <div className="bg-purple-900/50 p-4 mb-4 rounded-lg animate-fade-in-up">
        <h3 className="font-medium mb-2">🤝 {requests[0].fromUser.name} vill lägga till dig som vän</h3>
        <p className="text-sm text-zinc-400 mb-3">Skapa konto för att acceptera vänförfrågningar</p>
        <div className="flex gap-2">
          <button onClick={() => signIn("spotify")} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-medium transition">
            Skapa med Spotify
          </button>
          <button onClick={() => signIn("credentials")} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm font-medium transition">
            Skapa med Email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-purple-900/50 p-4 mb-4 rounded-lg animate-fade-in-up">
      {requests.map((req) => (
        <div key={req.id} className="flex items-center justify-between mb-2 last:mb-0">
          <span className="text-sm">🤝 {req.fromUser.name} vill lägga till dig som vän</span>
          <div className="flex gap-2">
            <button onClick={() => handleAction(req.id, "accept")} className="px-3 py-1 bg-[#1db954] text-black rounded text-sm font-medium hover:bg-[#1ed760] transition">
              Acceptera
            </button>
            <button onClick={() => handleAction(req.id, "reject")} className="px-3 py-1 bg-zinc-700 rounded text-sm hover:bg-zinc-600 transition">
              Avböj
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ===== Main Room Page ===== */
export default function RoomPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { queue, loading, refresh } = useQueue(id);
  const [activeTab, setActiveTab] = useState<"queue" | "search" | "playlist">("queue");
  const [isDesktop, setIsDesktop] = useState(false);
  const [room, setRoom] = useState<{ name: string; code: string; visibility?: string; _count: { members: number } } | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [guestInfo, setGuestInfo] = useState<{ guestId: string; guestName: string } | null>(null);

  const isGuest = status === "unauthenticated" && !!guestInfo;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      // Guest token is an httpOnly cookie - we can't read it client-side
      // but we can check if the API accepts us
      setGuestInfo({ guestId: "guest", guestName: "Gäst" }); // placeholder, real identity from server
    }
  }, [status, router]);

  // Fetch room info (guest token sent automatically via httpOnly cookie)
  useEffect(() => {
    if (!id) return;
    if (status === "loading") return;
    fetch(`/api/rooms/${id}`)
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          if (status === "unauthenticated") router.push("/");
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => { if (data) setRoom(data); })
      .catch(() => {});
  }, [id, status, router]);

  const copyCode = async () => {
    if (!room) return;
    await navigator.clipboard.writeText(room.code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = queue.findIndex((q) => q.id === active.id);
    const newIndex = queue.findIndex((q) => q.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    // Determine direction based on index change
    const steps = newIndex - oldIndex;
    const direction = steps > 0 ? "down" : "up";
    for (let i = 0; i < Math.abs(steps); i++) {
      await fetch(`/api/rooms/${id}/queue/${active.id}/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
    }
    refresh();
  };

  const vote = async (itemId: string) => {
    await fetch(`/api/rooms/${id}/queue/${itemId}/vote`, { method: "PUT" });
    refresh();
  };

  const remove = async (itemId: string) => {
    await fetch(`/api/rooms/${id}/queue/${itemId}`, { method: "DELETE" });
    refresh();
  };

  if (status === "loading" || (!session && !guestInfo)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#1db954] border-t-transparent" />
      </div>
    );
  }

  const currentUserId = session?.user?.id || guestInfo?.guestId || "";

  const tabs = [
    { id: "queue" as const, label: "Kö", icon: "🎵", count: queue.length },
    { id: "search" as const, label: "Sök", icon: "🔍" },
    { id: "playlist" as const, label: "Playlist", icon: "✨" },
  ];

  return (
    <main className="mx-auto max-w-4xl p-4 pb-28 sm:p-6">
      {/* Header */}
      <header className="mb-5">
        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => router.push("/app")} className="text-sm text-zinc-500 transition hover:text-white">
              ← Tillbaka
            </button>
            <h1 className="text-xl font-bold sm:text-2xl">{room?.name ?? "Musikkö"}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#1db954]/15 px-3 py-1 text-sm font-medium text-[#1db954]">
              {queue.length} låtar
            </span>
            {room && (
              <span className="rounded-full bg-zinc-800 px-3 py-1 text-sm text-zinc-400">
                👥 {room._count.members}
              </span>
            )}
          </div>
        </div>
        {room && room.visibility === 'private' ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-zinc-400">🔒 Privat rum (endast inbjudningar)</span>
            <button
              onClick={() => setShowInvite(true)}
              className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white active:scale-95"
            >
              👥 Bjud in
            </button>
          </div>
        ) : room && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-zinc-500">Rumskod:</span>
            <code className="rounded-md bg-zinc-800 px-2.5 py-1 text-sm font-mono font-bold tracking-wider text-white">
              {room.code}
            </code>
            <button
              onClick={copyCode}
              className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white active:scale-95"
            >
              {codeCopied ? "✓ Kopierad!" : "📋 Kopiera"}
            </button>
            <button
              onClick={() => setShowQR(true)}
              className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white active:scale-95"
            >
              📱 QR-kod
            </button>
            <button
              onClick={() => setShowInvite(true)}
              className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white active:scale-95"
            >
              👥 Bjud in
            </button>
          </div>
        )}
      </header>

      {/* Guest Conversion Banner */}
      {isGuest && <GuestConversionBanner />}

      {/* Friend Request Notifications */}
      <FriendRequestNotifications guestId={guestInfo?.guestId} />

      {/* Modals */}
      {showQR && room && (
        <RoomQRCode roomCode={room.code} roomName={room.name} onClose={() => setShowQR(false)} />
      )}
      {showInvite && room && (
        <InviteFriends roomCode={room.code} roomName={room.name} onClose={() => setShowInvite(false)} />
      )}

      {/* Mobile Tabs */}
      <div className="mb-5 flex gap-1 rounded-xl bg-[#1a1a1a] p-1 lg:hidden">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? "bg-[#2a2a2a] text-white shadow-sm"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <span className="text-xs">{tab.icon}</span>
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="rounded-full bg-[#1db954]/20 px-1.5 text-xs text-[#1db954]">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Desktop: split layout / Mobile: tabbed */}
      <div className="lg:grid lg:grid-cols-5 lg:gap-6">
        {/* Queue (left on desktop) */}
        <div className={`lg:col-span-3 ${activeTab !== "queue" ? "hidden lg:block" : ""}`}>
          <h2 className="mb-3 hidden text-sm font-medium text-zinc-400 lg:block">Kö</h2>
          {loading ? (
            <QueueSkeleton />
          ) : queue.length === 0 ? (
            <EmptyQueue />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <SortableContext items={queue.map((q) => q.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2 stagger-children">
                  {queue.map((item, i) => (
                    <SortableQueueItem
                      key={item.id}
                      item={item}
                      isOwn={item.addedBy === currentUserId}
                      hasVoted={item.votedBy?.includes(currentUserId) ?? false}
                      onVote={() => vote(item.id)}
                      onRemove={() => remove(item.id)}
                      index={i}
                    />
                  ))}
                </ul>
              </SortableContext>
              <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
                {activeDragId ? (() => {
                  const item = queue.find((q) => q.id === activeDragId);
                  if (!item) return null;
                  return (
                    <div className="flex items-center gap-3 rounded-xl border border-[#1db954]/30 bg-[#1a1a1a] p-3 shadow-2xl shadow-black/50">
                      {item.albumImage ? (
                        <img src={item.albumImage} alt="" className="h-12 w-12 rounded-lg shadow-md" />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#2a2a2a] text-lg">🎵</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium">{item.trackName}</p>
                        <p className="truncate text-xs text-zinc-500">{item.artistName}</p>
                      </div>
                    </div>
                  );
                })() : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        {/* Search + Playlist (right on desktop) */}
        <div className={`lg:col-span-2 ${activeTab === "queue" ? "hidden lg:block" : ""}`}>
          <div className={activeTab !== "search" && activeTab !== "playlist" ? "" : ""}>
            <div className={activeTab === "search" || activeTab === "queue" ? "" : "hidden lg:block"}>
              <h2 className="mb-3 hidden text-sm font-medium text-zinc-400 lg:block">Sök</h2>
              {(activeTab === "search" || isDesktop) && (
                <TrackSearch roomId={id} onAdded={refresh} />
              )}
            </div>
            <div className={activeTab === "playlist" || activeTab === "queue" ? "" : "hidden lg:block"}>
              <h2 className="mb-3 hidden text-sm font-medium text-zinc-400 lg:block">Auto-playlist</h2>
              {(activeTab === "playlist" || isDesktop) && (
                <PlaylistGenerator roomId={id} onAddedToQueue={refresh} />
              )}
            </div>
          </div>
        </div>
      </div>

      <MiniPlayer
        queueTrackUris={queue.map((item) => `spotify:track:${item.trackId}`)}
        roomName="Musikkö"
      />
    </main>
  );
}
