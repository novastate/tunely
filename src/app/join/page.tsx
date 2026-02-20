"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
// Guest auth now handled server-side via signed JWT tokens

function JoinContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const token = searchParams.get("token");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [showGuestForm, setShowGuestForm] = useState(false);

  // Auto-join if logged in
  useEffect(() => {
    if (status === "authenticated" && (code || token) && !joining) {
      joinRoom();
    }
    if (status === "unauthenticated" && (code || token)) {
      // Check if already has guest token cookie (will be verified server-side)
      const hasGuestToken = document.cookie.includes("guestToken=");
      if (hasGuestToken) {
        joinRoom();
      } else {
        setShowGuestForm(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, code, token]);

  const joinRoom = async (gName?: string) => {
    setJoining(true);
    setError("");
    try {
      const body: Record<string, string> = {};
      if (code) body.code = code;
      if (token) body.token = token;
      if (gName) body.guestName = gName;

      const res = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const room = await res.json();
        // Guest token is set as httpOnly cookie by the server
        router.push(`/room/${room.id}`);
      } else {
        const data = await res.json();
        setError(data.error || "Kunde inte gå med");
        setJoining(false);
      }
    } catch {
      setError("Något gick fel");
      setJoining(false);
    }
  };

  const handleGuestJoin = () => {
    if (!guestName.trim()) return;
    joinRoom(guestName.trim());
  };

  if (error) {
    return (
      <main className="animated-gradient flex min-h-screen flex-col items-center justify-center p-4 text-center">
        <div className="text-4xl mb-4">😕</div>
        <h1 className="text-xl font-bold mb-2">Kunde inte gå med</h1>
        <p className="text-zinc-500 mb-4">{error}</p>
        <div className="flex gap-3">
          <button onClick={() => router.push("/login")} className="rounded-xl border border-zinc-700 px-6 py-2.5 text-sm font-medium text-white">
            Logga in
          </button>
          <button onClick={() => router.push("/")} className="rounded-xl bg-[#1db954] px-6 py-2.5 text-sm font-medium text-black">
            Startsidan
          </button>
        </div>
      </main>
    );
  }

  if (showGuestForm) {
    return (
      <main className="animated-gradient flex min-h-screen flex-col items-center justify-center px-6">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-[#1db954]/10 blur-[120px]" />
        </div>
        <div className="relative z-10 w-full max-w-sm space-y-6 animate-fade-in-up">
          <div className="text-center">
            <div className="text-4xl mb-3">🎵</div>
            <h1 className="text-2xl font-bold mb-1">Gå med i rum</h1>
            <p className="text-zinc-400 text-sm">Ange ditt namn för att gå med som gäst</p>
          </div>

          <div className="space-y-3">
            <input
              type="text"
              placeholder="Ditt namn"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGuestJoin()}
              className="w-full rounded-xl border border-zinc-800 bg-[#1a1a1a] px-4 py-3 text-white placeholder-zinc-500 focus:border-[#1db954] focus:outline-none"
              autoFocus
            />
            <button
              onClick={handleGuestJoin}
              disabled={!guestName.trim()}
              className="w-full rounded-xl bg-[#1db954] py-3 font-semibold text-black transition-all hover:bg-[#1ed760] disabled:opacity-50"
            >
              Gå med som gäst
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-[#0a0a0a] px-4 text-zinc-500">eller</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <a href="/login" className="w-full text-center rounded-xl border border-zinc-700 py-3 font-medium text-white transition-all hover:bg-zinc-800/50">
              Logga in
            </a>
            <a href="/signup" className="w-full text-center text-sm text-zinc-500 hover:text-[#1db954]">
              Skapa konto
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="h-10 w-10 mx-auto animate-spin rounded-full border-2 border-[#1db954] border-t-transparent mb-4" />
        <p className="text-zinc-500">Går med i rum...</p>
      </div>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#1db954] border-t-transparent" />
      </main>
    }>
      <JoinContent />
    </Suspense>
  );
}
