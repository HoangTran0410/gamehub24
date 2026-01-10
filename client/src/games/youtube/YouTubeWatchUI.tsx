import React, { useEffect, useState, useRef } from "react";
import YouTube, { type YouTubeProps, type YouTubePlayer } from "react-youtube";
import { YouTubeWatch, type YouTubeWatchState } from "./YouTubeWatch";
import {
  Play,
  Pause,
  Link as LinkIcon,
  AlertCircle,
  Users,
  User,
} from "lucide-react";

interface YouTubeWatchUIProps {
  game: YouTubeWatch;
}

export const YouTubeWatchUI: React.FC<YouTubeWatchUIProps> = ({ game }) => {
  const [state, setState] = useState<YouTubeWatchState>(game.getState());
  const [urlInput, setUrlInput] = useState("");
  const [player, setPlayer] = useState<YouTubePlayer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ignoreNextUpdate = useRef(false);

  useEffect(() => {
    const handleStateChange = (newState: YouTubeWatchState) => {
      setState(newState);
    };
    game.onUpdate(handleStateChange);
    setState(game.getState());
    game.requestSync();
  }, [game]);

  useEffect(() => {
    if (!player || !state.videoId) return;
    if (typeof player.getPlayerState !== "function") return;

    if (ignoreNextUpdate.current) {
      ignoreNextUpdate.current = false;
      return;
    }

    try {
      const playerState = player.getPlayerState();
      const currentTime = player.getCurrentTime();

      if (state.isPlaying) {
        if (playerState !== 1 && playerState !== 3) {
          player.playVideo();
        }
      } else {
        if (playerState === 1 || playerState === 3) {
          player.pauseVideo();
        }
      }

      if (Math.abs(currentTime - state.timestamp) > 2) {
        player.seekTo(state.timestamp, true);
      }
    } catch (e) {
      console.error("Error syncing YouTube player:", e);
    }
  }, [state.isPlaying, state.timestamp, state.videoId, player]);

  useEffect(() => {
    if (!game.isHostUser || !player || !state.isPlaying) return;

    const interval = setInterval(() => {
      try {
        if (typeof player.getCurrentTime === "function") {
          const currentTime = player.getCurrentTime();
          game.sync(true, currentTime);
        }
      } catch (e) {
        console.error("Error in host sync:", e);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [game, player, state.isPlaying]);

  const onReady: YouTubeProps["onReady"] = (event) => {
    setPlayer(event.target);
  };

  const onStateChange: YouTubeProps["onStateChange"] = (event) => {
    const pState = event.data;
    const currentTime = event.target.getCurrentTime();

    const canControl = game.isHostUser || state.allowGuestControl;

    if (!canControl) {
      // Revert changes if user tries to control but is not allowed?
      // This is tricky with IFrame. We can't prevent click easily.
      // But our sync logic will snap them back eventually.
      return;
    }

    if (pState === 1) {
      // Playing
      if (!state.isPlaying) {
        game.sync(true, currentTime);
      }
    } else if (pState === 2) {
      // Paused
      if (state.isPlaying) {
        game.sync(false, currentTime);
      }
    }
  };

  const handleSetVideo = () => {
    if (!urlInput) return;
    try {
      game.setVideo(urlInput);
      setError(null);
      setUrlInput("");
    } catch (e) {
      setError("Invalid URL");
    }
  };

  const handleToggleGuest = () => {
    game.toggleGuestControl(!state.allowGuestControl);
  };

  const opts: YouTubeProps["opts"] = {
    height: "100%",
    width: "100%",
    playerVars: {
      autoplay: 1,
      controls: 1,
      modestbranding: 1,
      rel: 0,
    },
  };

  return (
    <div className="flex flex-col items-center w-full h-full p-1 md:p-4 gap-4">
      {/* Host Controls */}
      <div className="flex flex-col gap-2 w-full max-w-4xl">
        {game.isHostUser && (
          <div className="flex gap-2 w-full items-center">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Paste YouTube URL or ID..."
                className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => e.key === "Enter" && handleSetVideo()}
              />
            </div>
            <button
              onClick={handleSetVideo}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors whitespace-nowrap"
            >
              Load
            </button>
          </div>
        )}

        {/* Guest Control Toggle (Host Only) or Status Indicator */}
        <div className="flex justify-between items-center bg-white/5 p-2 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-gray-300">
            {state.allowGuestControl ? (
              <Users className="w-4 h-4 text-green-400" />
            ) : (
              <User className="w-4 h-4 text-yellow-400" />
            )}
            <span>
              Guest Control:{" "}
              <span
                className={
                  state.allowGuestControl ? "text-green-400" : "text-yellow-400"
                }
              >
                {state.allowGuestControl ? "ON" : "OFF"}
              </span>
            </span>
          </div>

          {game.isHostUser && (
            <button
              onClick={handleToggleGuest}
              className={`
                        relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900
                        ${
                          state.allowGuestControl
                            ? "bg-green-600"
                            : "bg-gray-600"
                        }
                    `}
            >
              <span
                className={`
                            inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out
                            ${
                              state.allowGuestControl
                                ? "translate-x-6"
                                : "translate-x-1"
                            }
                        `}
              />
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Video Player */}
      <div className="w-full max-w-4xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl relative">
        {state.videoId ? (
          <YouTube
            key={state.videoId}
            videoId={state.videoId}
            opts={opts}
            onReady={onReady}
            onStateChange={onStateChange}
            className="w-full h-full"
            iframeClassName="w-full h-full"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-2">
            <Play className="w-12 h-12 opacity-50" />
            <p>Waiting for host to select a video...</p>
            <p className="text-xs text-gray-600">ID: {game.getRoomId}</p>
          </div>
        )}
      </div>

      {/* Info Bar */}
      <div className="flex justify-between items-center w-full max-w-4xl text-sm text-gray-500">
        <div className="flex items-center gap-2">
          {state.isPlaying ? (
            <span className="flex items-center gap-1 text-green-400">
              <Play className="w-3 h-3" /> Playing
            </span>
          ) : (
            <span className="flex items-center gap-1 text-yellow-500">
              <Pause className="w-3 h-3" /> Paused
            </span>
          )}
        </div>
        <div>
          {state.videoId && (
            <>
              Video ID:{" "}
              <a
                href={`https://www.youtube.com/watch?v=${state.videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-600"
              >
                {state.videoId}
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
