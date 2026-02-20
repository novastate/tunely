// Spotify Web Playback SDK wrapper
// Requires Spotify Premium

declare global {
  interface Window {
    Spotify: typeof Spotify;
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

let sdkLoaded = false;
let sdkReadyPromise: Promise<void> | null = null;

export function loadSpotifySDK(): Promise<void> {
  if (sdkReadyPromise) return sdkReadyPromise;

  sdkReadyPromise = new Promise((resolve) => {
    if (window.Spotify) {
      sdkLoaded = true;
      resolve();
      return;
    }

    window.onSpotifyWebPlaybackSDKReady = () => {
      sdkLoaded = true;
      resolve();
    };

    if (!document.getElementById("spotify-sdk")) {
      const script = document.createElement("script");
      script.id = "spotify-sdk";
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      document.body.appendChild(script);
    }
  });

  return sdkReadyPromise;
}

export interface PlayerState {
  isPlaying: boolean;
  currentTrack: {
    id: string;
    name: string;
    artists: string;
    albumImage: string;
    durationMs: number;
    positionMs: number;
    uri: string;
  } | null;
}

export function createPlayer(
  accessToken: string,
  name = "Musik-app Player"
): Promise<{ player: Spotify.Player; deviceId: string }> {
  return new Promise(async (resolve, reject) => {
    await loadSpotifySDK();

    const player = new window.Spotify.Player({
      name,
      getOAuthToken: (cb) => cb(accessToken),
      volume: 0.5,
    });

    player.addListener("ready", ({ device_id }) => {
      resolve({ player, deviceId: device_id });
    });

    player.addListener("initialization_error", ({ message }) => reject(new Error(message)));
    player.addListener("authentication_error", ({ message }) => reject(new Error(message)));
    player.addListener("account_error", ({ message }) => reject(new Error("Premium required")));

    const connected = await player.connect();
    if (!connected) reject(new Error("Failed to connect player"));
  });
}

export function parsePlayerState(state: Spotify.PlaybackState | null): PlayerState {
  if (!state || !state.track_window.current_track) {
    return { isPlaying: false, currentTrack: null };
  }

  const track = state.track_window.current_track;
  return {
    isPlaying: !state.paused,
    currentTrack: {
      id: track.id ?? "",
      name: track.name,
      artists: track.artists.map((a) => a.name).join(", "),
      albumImage: track.album.images[0]?.url ?? "",
      durationMs: state.duration,
      positionMs: state.position,
      uri: track.uri,
    },
  };
}
