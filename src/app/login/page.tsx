"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) {
      router.push(session.user.onboarded ? "/app" : "/onboarding");
    }
  }, [session, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Fel email eller lösenord");
      setLoading(false);
    } else {
      router.push("/app");
    }
  };

  return (
    <main className="animated-gradient flex min-h-screen flex-col items-center justify-center px-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-[#1db954]/10 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm space-y-8 animate-fade-in-up">
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1db954] text-2xl shadow-lg shadow-[#1db954]/20">
              🎵
            </div>
            <h1 className="text-4xl font-bold tracking-tight">
              Musik<span className="text-[#1db954]">rum</span>
            </h1>
          </div>
          <p className="text-zinc-400">Logga in för att fortsätta</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-zinc-800 bg-[#1a1a1a] px-4 py-3 text-white placeholder-zinc-500 focus:border-[#1db954] focus:outline-none"
            required
          />
          <input
            type="password"
            placeholder="Lösenord"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-zinc-800 bg-[#1a1a1a] px-4 py-3 text-white placeholder-zinc-500 focus:border-[#1db954] focus:outline-none"
            required
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#1db954] py-3 font-semibold text-black transition-all hover:bg-[#1ed760] disabled:opacity-50"
          >
            {loading ? "Loggar in..." : "Logga in"}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-[#0a0a0a] px-4 text-zinc-500">eller</span>
          </div>
        </div>

        <button
          onClick={() => signIn("spotify")}
          className="w-full flex items-center justify-center gap-3 rounded-xl border border-zinc-800 bg-[#1a1a1a] py-3 font-medium text-white transition-all hover:bg-zinc-800"
        >
          <svg className="h-5 w-5 text-[#1db954]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          Logga in med Spotify
        </button>

        <p className="text-center text-sm text-zinc-500">
          Inget konto?{" "}
          <a href="/signup" className="text-[#1db954] hover:underline">
            Skapa konto
          </a>
        </p>
      </div>
    </main>
  );
}
