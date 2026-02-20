"use client";

import { useState } from "react";

interface ExportPlaylistModalProps {
  tracks: Array<{ trackId: string; trackName: string; artistName: string }>;
  open: boolean;
  onClose: () => void;
}

export function ExportPlaylistModal({ tracks, open, onClose }: ExportPlaylistModalProps) {
  const [playlistName, setPlaylistName] = useState(
    `Tunely - ${new Date().toISOString().split("T")[0]}`
  );
  const [exporting, setExporting] = useState(false);
  const [exportedUrl, setExportedUrl] = useState("");
  const [error, setError] = useState("");

  if (!open) return null;

  const handleExportSpotify = async () => {
    setExporting(true);
    setError("");

    try {
      const trackUris = tracks
        .map((t) => `spotify:track:${t.trackId}`)
        .filter((uri) => !uri.endsWith(":undefined") && !uri.endsWith(":null"));

      if (trackUris.length === 0) {
        setError("Inga låtar att exportera");
        return;
      }

      const res = await fetch("/api/spotify/export-playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: playlistName,
          trackUris,
        }),
      });

      const data = await res.json();

      if (data.ok || data.success) {
        setExportedUrl(data.playlistUrl);
      } else if (res.status === 401) {
        setError("Du måste vara inloggad med Spotify för att exportera");
      } else {
        setError(data.error || "Export misslyckades");
      }
    } catch (err) {
      console.error("Export error:", err);
      setError("Något gick fel vid exporten");
    } finally {
      setExporting(false);
    }
  };

  const handleClose = () => {
    setExportedUrl("");
    setError("");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#141414] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">Exportera playlist</h2>

        {!exportedUrl ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Playlist-namn</label>
              <input
                type="text"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-[#1a1a1a] px-4 py-3 text-white placeholder-zinc-500 focus:border-[#1db954] focus:outline-none"
              />
            </div>

            <p className="text-sm text-zinc-500">{tracks.length} låtar</p>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="space-y-2">
              <button
                onClick={handleExportSpotify}
                disabled={exporting}
                className="w-full rounded-xl bg-[#1db954] px-4 py-3 font-semibold text-black transition hover:bg-[#1ed760] disabled:opacity-50 active:scale-[0.98]"
              >
                {exporting ? "Exporterar..." : "🎵 Exportera till Spotify"}
              </button>

              <button
                disabled
                className="w-full rounded-xl bg-[#2a2a2a] px-4 py-3 text-sm text-zinc-500 cursor-not-allowed"
              >
                🍎 Apple Music (kommer snart)
              </button>

              <button
                disabled
                className="w-full rounded-xl bg-[#2a2a2a] px-4 py-3 text-sm text-zinc-500 cursor-not-allowed"
              >
                ▶️ YouTube Music (kommer snart)
              </button>

              <button
                disabled
                className="w-full rounded-xl bg-[#2a2a2a] px-4 py-3 text-sm text-zinc-500 cursor-not-allowed"
              >
                📥 Ladda ner M3U (kommer snart)
              </button>
            </div>

            <button
              onClick={handleClose}
              className="w-full text-sm text-zinc-500 hover:text-white transition"
            >
              Avbryt
            </button>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <div className="text-[#1db954] text-5xl">✓</div>
            <p className="text-lg font-medium">Playlist skapad!</p>
            <p className="text-sm text-zinc-400">{tracks.length} låtar exporterade</p>
            <a
              href={exportedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block w-full rounded-xl bg-[#1db954] px-6 py-3 font-semibold text-black transition hover:bg-[#1ed760] active:scale-[0.98]"
            >
              Öppna i Spotify
            </a>
            <button
              onClick={handleClose}
              className="w-full rounded-xl bg-[#2a2a2a] px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-700 transition"
            >
              Stäng
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
