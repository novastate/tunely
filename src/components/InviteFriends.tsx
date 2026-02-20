"use client";

import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";

interface Friend {
  id: string;
  friendName: string;
  spotifyId: string | null;
  email: string | null;
}

interface InviteFriendsProps {
  roomCode: string;
  roomName: string;
  onClose: () => void;
}

export function InviteFriends({ roomCode, roomName, onClose }: InviteFriendsProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  const joinUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/join?code=${roomCode}`;

  useEffect(() => {
    fetch("/api/friends")
      .then((r) => r.ok ? r.json() : [])
      .then(setFriends)
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === friends.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(friends.map((f) => f.id)));
    }
  };

  const copyInvites = async () => {
    const selectedFriends = friends.filter((f) => selected.has(f.id));
    const text = `Hej! Gå med i "${roomName}" på Musikrum!\n\n${joinUrl}\n\nRumskod: ${roomCode}\n\nBjudna: ${selectedFriends.map((f) => f.friendName).join(", ")}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareInvites = async () => {
    if (navigator.share) {
      await navigator.share({
        title: `Gå med i ${roomName}`,
        text: `Hej! Gå med i "${roomName}" på Musikrum! Rumskod: ${roomCode}`,
        url: joinUrl,
      });
    } else {
      copyInvites();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-4 w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-[#141414] p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-lg font-bold">Bjud in</h2>
        <p className="mb-4 text-sm text-zinc-500">Till {roomName}</p>

        {/* 1. QR Code - big and prominent */}
        <div className="mb-4 flex flex-col items-center bg-zinc-800/50 p-6 rounded-lg">
          <h3 className="text-lg font-medium mb-4">Scanna för att joina</h3>
          <QRCodeSVG
            value={joinUrl}
            size={200}
            level="M"
            bgColor="transparent"
            fgColor="#ffffff"
            className="bg-white p-4 rounded"
          />
          <p className="text-sm text-zinc-400 mt-2">Visa QR-koden för dina vänner</p>
        </div>

        {/* 2. Invite link */}
        <div className="mb-4 rounded-xl bg-zinc-900 p-3">
          <p className="mb-2 text-xs font-medium text-zinc-400">Eller dela länk</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={joinUrl}
              readOnly
              className="flex-1 min-w-0 rounded-lg bg-zinc-800 px-3 py-2 text-xs text-zinc-300 outline-none"
            />
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(joinUrl);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              }}
              className="shrink-0 rounded-lg bg-[#1db954] px-3 py-2 text-xs font-medium text-black transition hover:bg-[#1ed760]"
            >
              {linkCopied ? "✓" : "📋"}
            </button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button
                onClick={() => navigator.share({ url: joinUrl, title: `Joina ${roomName}` })}
                className="shrink-0 rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-purple-500"
              >
                📤
              </button>
            )}
          </div>
        </div>

        {/* 3. Friends list (if any) */}
        {loading ? (
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#1db954] border-t-transparent" />
          </div>
        ) : friends.length > 0 ? (
          <>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-zinc-400">Bjud in vänner</p>
              <button onClick={selectAll} className="text-xs text-zinc-500 hover:text-white transition">
                {selected.size === friends.length ? "Avmarkera alla" : "Markera alla"}
              </button>
            </div>
            <ul className="max-h-48 overflow-y-auto space-y-1 mb-4">
              {friends.map((f) => (
                <li key={f.id}>
                  <button
                    onClick={() => toggle(f.id)}
                    className={`w-full flex items-center gap-3 rounded-lg p-3 text-left transition ${
                      selected.has(f.id) ? "bg-[#1db954]/10 border border-[#1db954]/30" : "bg-zinc-900 border border-transparent hover:border-zinc-700"
                    }`}
                  >
                    <span className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${
                      selected.has(f.id) ? "border-[#1db954] bg-[#1db954] text-black" : "border-zinc-600"
                    }`}>
                      {selected.has(f.id) && "✓"}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{f.friendName}</p>
                      {f.email && <p className="text-xs text-zinc-500">{f.email}</p>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            {selected.size > 0 && (
              <div className="flex gap-2">
                <button onClick={copyInvites} className="flex-1 rounded-xl bg-zinc-800 py-2.5 text-sm font-medium transition hover:bg-zinc-700">
                  {copied ? "✓ Kopierad!" : "📋 Kopiera inbjudan"}
                </button>
                <button onClick={shareInvites} className="flex-1 rounded-xl bg-[#1db954] py-2.5 text-sm font-medium text-black transition hover:bg-[#1ed760]">
                  📤 Dela
                </button>
              </div>
            )}
          </>
        ) : null}

        <button onClick={onClose} className="mt-3 w-full text-sm text-zinc-500 hover:text-white transition">
          Stäng
        </button>
      </div>
    </div>
  );
}
