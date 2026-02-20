"use client";

import { useSpotifyPlayer } from "@/hooks/useSpotifyPlayer";
import { useState } from "react";

interface MiniPlayerProps {
  queueTrackUris: string[];
  roomName?: string;
}

export function MiniPlayer({ queueTrackUris, roomName }: MiniPlayerProps) {
  const {
    isReady,
    isPremium,
    playerState,
    error,
    play,
    playQueue,
    pause,
    resume,
    skipToNext,
  } = useSpotifyPlayer();

  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  const handleExport = async () => {
    if (queueTrackUris.length === 0) return;
    setExporting(true);
    try {
      const res = await fetch("/api/spotify/export-playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: roomName ? `${roomName} — Musik-app` : undefined,
          trackUris: queueTrackUris,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setExportUrl(data.playlistUrl);
      }
    } finally {
      setExporting(false);
    }
  };

  // Not premium — show info + export only
  if (isPremium === false) {
    return (
      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-sm p-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-amber-400">⚠️ Playback kräver Spotify Premium</p>
            <a
              href="https://www.spotify.com/premium/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-400 underline hover:text-white"
            >
              Uppgradera till Premium →
            </a>
          </div>
          {queueTrackUris.length > 0 && (
            <div className="flex items-center gap-2">
              {exportUrl ? (
                <a
                  href={exportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-500"
                >
                  Öppna i Spotify ↗
                </a>
              ) : (
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {exporting ? "Exporterar..." : "📋 Exportera playlist"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Still loading premium status
  if (isPremium === null) return null;

  // Error state
  if (error) {
    return (
      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-sm p-4">
        <p className="mx-auto max-w-2xl text-sm text-red-400">Player-fel: {error}</p>
      </div>
    );
  }

  const { currentTrack, isPlaying } = playerState;

  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-2xl items-center gap-3 p-3">
        {/* Track info */}
        {currentTrack ? (
          <div className="flex flex-1 items-center gap-3 min-w-0">
            {currentTrack.albumImage && (
              <img
                src={currentTrack.albumImage}
                alt=""
                className="h-12 w-12 rounded-lg shadow-lg"
              />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{currentTrack.name}</p>
              <p className="truncate text-xs text-zinc-400">{currentTrack.artists}</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 text-sm text-zinc-500">
            {isReady ? "Redo att spela" : "Ansluter till Spotify..."}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-2">
          {isPlaying ? (
            <button
              onClick={pause}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black hover:bg-zinc-200 transition"
            >
              ⏸
            </button>
          ) : (
            <button
              onClick={() => (currentTrack ? resume() : playQueue(queueTrackUris))}
              disabled={!isReady || queueTrackUris.length === 0}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black hover:bg-zinc-200 transition disabled:opacity-50"
            >
              ▶
            </button>
          )}
          <button
            onClick={skipToNext}
            disabled={!isReady || !currentTrack}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-white hover:bg-zinc-700 transition disabled:opacity-50 text-sm"
          >
            ⏭
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 border-l border-zinc-800 pl-3">
          {queueTrackUris.length > 0 && !currentTrack && (
            <button
              onClick={() => playQueue(queueTrackUris)}
              disabled={!isReady}
              className="rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-50 transition"
            >
              ▶ Spela kön
            </button>
          )}
          {queueTrackUris.length > 0 && (
            <>
              {exportUrl ? (
                <a
                  href={exportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700"
                >
                  Öppna ↗
                </a>
              ) : (
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition"
                >
                  {exporting ? "..." : "📋 Export"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
