"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) {
      router.push(session.user.onboarded ? "/app" : "/onboarding");
    }
  }, [session, router]);

  if (status === "loading") {
    return (
      <div className="animated-gradient flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#1db954] border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="animated-gradient flex min-h-screen flex-col items-center justify-center px-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-[#1db954]/10 blur-[120px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1db954] text-2xl shadow-lg shadow-[#1db954]/20">
            🎵
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Musik<span className="text-[#1db954]">rum</span>
          </h1>
        </div>

        <p className="max-w-md text-center text-lg text-zinc-400 sm:text-xl">
          Musik för alla i rummet.
          <br />
          <span className="text-zinc-500">Delad kö & smarta spellistor — tillsammans.</span>
        </p>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <a
            href="/signup"
            className="flex items-center justify-center rounded-full bg-[#1db954] px-8 py-4 text-lg font-semibold text-black shadow-lg shadow-[#1db954]/25 transition-all duration-200 hover:bg-[#1ed760] hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
          >
            Skapa konto
          </a>
          <a
            href="/login"
            className="flex items-center justify-center rounded-full border border-zinc-700 px-8 py-4 text-lg font-medium text-white transition-all duration-200 hover:bg-zinc-800/50 hover:scale-[1.02] active:scale-[0.98]"
          >
            Logga in
          </a>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-6 text-center text-sm text-zinc-500">
          <div className="flex flex-col items-center gap-2">
            <span className="text-2xl">🎶</span>
            <span>Delad kö</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-2xl">✨</span>
            <span>Smart playlist</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-2xl">👥</span>
            <span>Rösta på låtar</span>
          </div>
        </div>
      </div>
    </main>
  );
}
