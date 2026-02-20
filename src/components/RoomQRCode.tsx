"use client";

import { useState, useEffect } from "react";
import QRCode from "qrcode";

interface RoomQRCodeProps {
  roomCode: string;
  roomName: string;
  onClose: () => void;
}

export function RoomQRCode({ roomCode, roomName, onClose }: RoomQRCodeProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const joinUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/join?code=${roomCode}`;

  useEffect(() => {
    QRCode.toDataURL(joinUrl, {
      width: 300,
      margin: 2,
      color: { dark: "#ffffff", light: "#0a0a0a" },
    }).then(setQrDataUrl);
  }, [joinUrl]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: `Gå med i ${roomName}`, url: joinUrl });
    } else {
      copyLink();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#141414] p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-lg font-bold">Dela {roomName}</h2>
        <p className="mb-4 text-sm text-zinc-500">Skanna QR-koden för att gå med</p>

        {qrDataUrl && (
          <img src={qrDataUrl} alt="QR-kod" className="mx-auto mb-4 rounded-xl" />
        )}

        <div className="mb-4 flex items-center justify-center gap-2">
          <code className="rounded-lg bg-zinc-800 px-4 py-2 text-lg font-mono font-bold tracking-widest">
            {roomCode}
          </code>
        </div>

        <div className="flex gap-2">
          <button onClick={copyLink} className="flex-1 rounded-xl bg-zinc-800 py-2.5 text-sm font-medium transition hover:bg-zinc-700">
            {copied ? "✓ Kopierad!" : "📋 Kopiera länk"}
          </button>
          <button onClick={share} className="flex-1 rounded-xl bg-[#1db954] py-2.5 text-sm font-medium text-black transition hover:bg-[#1ed760]">
            📤 Dela
          </button>
        </div>

        <button onClick={onClose} className="mt-3 text-sm text-zinc-500 hover:text-white transition">
          Stäng
        </button>
      </div>
    </div>
  );
}
