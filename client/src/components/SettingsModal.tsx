import { useState, useEffect, useRef } from "react";
import { Settings, RefreshCw, Wifi, WifiOff, Save } from "lucide-react";
import { useSocketStore } from "../stores/socketStore";
import { useUserStore } from "../stores/userStore";
import { getServerUrl, setServerUrl } from "../services/socket";
import { useAlertStore } from "../stores/alertStore";

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { isConnected } = useSocketStore();
  const { generateNewId, userId, username } = useUserStore();
  const { show: showAlert, confirm: confirmAction } = useAlertStore();

  const [url, setUrl] = useState(getServerUrl());
  const [isRegenerating, setIsRegenerating] = useState(false);

  const waitReConnectRef = useRef(false);

  useEffect(() => {
    if (waitReConnectRef.current && isConnected) {
      waitReConnectRef.current = false;
      showAlert("Reconnected to server", { type: "success" });
    }
  }, [isConnected]);

  const handleSaveUrl = () => {
    try {
      if (!url.startsWith("http")) {
        showAlert("URL must start with http:// or https://", { type: "error" });
        return;
      }
      waitReConnectRef.current = true;
      setServerUrl(url);
      showAlert("Server URL updated. Reconnecting...", { type: "loading" });
    } catch (e) {
      showAlert("Invalid URL", { type: "error" });
    }
  };

  const handleRegenerateIdentity = async () => {
    if (
      await confirmAction(
        "Are you sure? This will generate a new random ID and username. The page will reload.",
        "Regenerate Identity"
      )
    ) {
      setIsRegenerating(true);
      generateNewId();
      window.location.reload();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
      <div className="bg-background-secondary border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl mx-4 animate-scaleIn">
        <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
          <Settings className="w-6 h-6 text-primary" />
          <h2 className="font-display text-2xl text-text-primary">Settings</h2>
        </div>

        <div className="space-y-6">
          {/* Server URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">
              Server URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://localhost:3001"
                className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={handleSaveUrl}
                className="px-3 py-2 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors"
                title="Save URL"
              >
                <Save className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setUrl("https://game.fbaio.xyz");
                  waitReConnectRef.current = true;
                  setServerUrl("https://game.fbaio.xyz");
                  showAlert("Reset to default server. Reconnecting...", {
                    type: "loading",
                  });
                }}
                className="px-3 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg transition-colors"
                title="Reset to Default"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Connection Status */}
          <div className="bg-white/5 rounded-xl p-4 flex items-center justify-between">
            <span className="text-sm font-medium text-text-secondary">
              Status
            </span>
            <div
              className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                isConnected
                  ? "bg-green-500/20 text-green-500 border border-green-500/30"
                  : "bg-red-500/20 text-red-500 border border-red-500/30"
              }`}
            >
              {isConnected ? (
                <Wifi className="w-3 h-3" />
              ) : (
                <WifiOff className="w-3 h-3" />
              )}
              {isConnected ? "Connected" : "Disconnected"}
            </div>
          </div>

          <div className="h-px bg-white/10 my-4" />

          {/* Identity */}
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-text-secondary mb-1">
                Your Identity
              </div>
              <div className="text-xs text-text-muted break-all font-mono bg-black/20 p-2 rounded">
                ID: {userId}
              </div>
              <div className="text-xs text-text-muted mt-1 font-mono bg-black/20 p-2 rounded">
                Username: {username}
              </div>
            </div>

            <button
              onClick={handleRegenerateIdentity}
              disabled={isRegenerating}
              className="w-full px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-xl transition-all flex items-center justify-center gap-2 font-medium"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRegenerating ? "animate-spin" : ""}`}
              />
              Generate New Identity
            </button>
          </div>
        </div>

        <div className="mt-8 pt-4 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
