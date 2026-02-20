"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { createPlayer, parsePlayerState, type PlayerState } from "@/lib/spotify-player";

export function useSpotifyPlayer() {
  const { data: session } = useSession();
  const playerRef = useRef<Spotify.Player | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    currentTrack: null,
  });
  const [error, setError] = useState<string | null>(null);

  // Check premium status
  useEffect(() => {
    if (!session?.accessToken) return;
    fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
      .then((r) => r.json())
      .then((data) => setIsPremium(data.product === "premium"))
      .catch(() => setIsPremium(false));
  }, [session?.accessToken]);

  // Initialize player (only if premium)
  useEffect(() => {
    if (!session?.accessToken || isPremium !== true) return;

    let destroyed = false;

    createPlayer(session.accessToken)
      .then(({ player, deviceId: id }) => {
        if (destroyed) {
          player.disconnect();
          return;
        }
        playerRef.current = player;
        setDeviceId(id);
        setIsReady(true);

        player.addListener("player_state_changed", (state) => {
          setPlayerState(parsePlayerState(state));
        });
      })
      .catch((e) => {
        if (!destroyed) setError(e.message);
      });

    return () => {
      destroyed = true;
      playerRef.current?.disconnect();
      playerRef.current = null;
      setIsReady(false);
      setDeviceId(null);
    };
  }, [session?.accessToken, isPremium]);

  const play = useCallback(
    async (trackUri?: string) => {
      if (!deviceId || !session?.accessToken) return;
      await fetch("/api/spotify/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackUri, deviceId }),
      });
    },
    [deviceId, session?.accessToken]
  );

  const playQueue = useCallback(
    async (trackUris: string[]) => {
      if (!deviceId || !session?.accessToken) return;
      await fetch("/api/spotify/play-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackUris, deviceId }),
      });
    },
    [deviceId, session?.accessToken]
  );

  const pause = useCallback(async () => {
    await playerRef.current?.pause();
  }, []);

  const resume = useCallback(async () => {
    await playerRef.current?.resume();
  }, []);

  const skipToNext = useCallback(async () => {
    await playerRef.current?.nextTrack();
  }, []);

  return {
    isReady,
    isPremium,
    deviceId,
    playerState,
    error,
    play,
    playQueue,
    pause,
    resume,
    skipToNext,
  };
}
