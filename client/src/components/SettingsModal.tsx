import { useState, useEffect, useRef } from "react";
import {
  Settings,
  RefreshCw,
  Wifi,
  WifiOff,
  Save,
  Dices,
  X,
  Zap,
} from "lucide-react";
import { useSocketStore } from "../stores/socketStore";
import {
  generateRandomUsername,
  generateSuffix,
  cleanName,
  useUserStore,
} from "../stores/userStore";
import useLanguage, { Language } from "../stores/languageStore";
import { getServerUrl, setServerUrl } from "../services/socket";
import { useAlertStore } from "../stores/alertStore";
import { useSettingsStore } from "../stores/settingsStore";
import Portal from "./Portal";

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { isConnected } = useSocketStore();
  const { username, setUsername } = useUserStore();
  const { show: showAlert } = useAlertStore();
  const { ti, ts, language, setLanguage } = useLanguage();
  const { enableGlassEffects, setEnableGlassEffects } = useSettingsStore();

  useEffect(() => {
    if (enableGlassEffects) {
      document.body.classList.remove("no-glass");
    } else {
      document.body.classList.add("no-glass");
    }
  }, [enableGlassEffects]);

  const [url, setUrl] = useState(getServerUrl());
  const [newUsername, setNewUsername] = useState("");
  const [previewUsername, setPreviewUsername] = useState("");

  const waitReConnectRef = useRef(false);

  useEffect(() => {
    if (waitReConnectRef.current && isConnected) {
      waitReConnectRef.current = false;
      showAlert(
        ts({ en: "Reconnected to server", vi: "Đã kết nối lại server" }),
        { type: "success" },
      );
    }
  }, [isConnected]);

  const handleSaveUrl = () => {
    try {
      if (!url.startsWith("http")) {
        showAlert(
          ts({
            en: "URL must start with http:// or https://",
            vi: "URL phải bắt đầu bằng http:// hoặc https://",
          }),
          { type: "error" },
        );
        return;
      }
      waitReConnectRef.current = true;
      setServerUrl(url);
      showAlert(
        ts({
          en: "Server URL updated. Reconnecting...",
          vi: "Đã cập nhật URL server. Đang kết nối lại...",
        }),
        { type: "loading" },
      );
    } catch (e) {
      showAlert(ts({ en: "Invalid URL", vi: "URL không hợp lệ" }), {
        type: "error",
      });
    }
  };

  // Update preview when newUsername changes
  useEffect(() => {
    if (newUsername.trim()) {
      setPreviewUsername(`${cleanName(newUsername)}${generateSuffix()}`);
    } else {
      setPreviewUsername("");
    }
  }, [newUsername]);

  const handleChangeUsername = () => {
    const trimmed = newUsername.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 20) {
      showAlert(
        ts({
          en: "Username must be 2-20 characters",
          vi: "Tên phải từ 2-20 ký tự",
        }),
        { type: "error" },
      );
      return;
    }

    const finalUsername = `${cleanName(trimmed)}${generateSuffix()}`;
    setUsername(finalUsername);
    setNewUsername("");
    showAlert(
      ts({
        en: "Username updated. Reconnecting...",
        vi: "Đã cập nhật tên. Đang kết nối lại...",
      }),
      { type: "success" },
    );
    waitReConnectRef.current = true;
    window.location.reload();
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn"
        // onClick={onClose}
      >
        <div
          className="relative bg-background-secondary border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl mx-4 animate-scaleIn max-h-[90vh] overflow-y-auto overflow-x-hidden"
          // onClick={(e) => e.stopPropagation()}
        >
          {/* Close button top-left */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
            <Settings className="w-6 h-6 text-primary" />
            <h2 className="font-display text-2xl text-text-primary">
              {ti({ en: "Settings", vi: "Cài đặt" })}
            </h2>
          </div>

          <div className="space-y-6">
            {/* Language Switcher */}
            <div className="space-y-2">
              <div className="flex gap-2">
                {[
                  { value: Language.en, label: "🇺🇸 English" },
                  { value: Language.vi, label: "🇻🇳 Tiếng Việt" },
                ].map((lang) => (
                  <button
                    key={lang.value}
                    onClick={() => setLanguage(lang.value)}
                    className={`flex-1 px-4 py-2.5 rounded-lg border transition-all ${
                      language === lang.value
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "bg-white/5 border-white/10 text-text-secondary hover:bg-white/10"
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Server URL */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-secondary">
                {ti({ en: "Server URL", vi: "URL Server" })}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="http://localhost:3001"
                  className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary min-w-0"
                />
                <button
                  onClick={handleSaveUrl}
                  className="px-3 py-2 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors"
                  title={ts({ en: "Save URL", vi: "Lưu URL" })}
                >
                  <Save className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setUrl("https://game.fbaio.xyz");
                    waitReConnectRef.current = true;
                    setServerUrl("https://game.fbaio.xyz");
                    showAlert(
                      ts({
                        en: "Reset to default server. Reconnecting...",
                        vi: "Đã reset về server mặc định. Đang kết nối lại...",
                      }),
                      {
                        type: "loading",
                      },
                    );
                  }}
                  className="px-3 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg transition-colors"
                  title={ts({
                    en: "Reset to Default",
                    vi: "Reset về mặc định",
                  })}
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {/* Connection Status */}
              <div className="bg-white/5 rounded-xl p-4 flex items-center justify-between">
                <span className="text-sm font-medium text-text-secondary">
                  {ti({ en: "Status", vi: "Trạng thái" })}
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
                  {isConnected
                    ? ti({ en: "Connected", vi: "Đã kết nối" })
                    : ti({ en: "Disconnected", vi: "Mất kết nối" })}
                </div>
              </div>

              {/* Performance - Glass Effects */}
              <div className="bg-white/5 rounded-xl p-4 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-text-primary">
                    {ti({
                      en: "Hi-Quality UI",
                      vi: "Giao diện chất lượng cao",
                    })}
                  </span>
                  <span className="text-xs text-text-muted">
                    {ti({
                      en: "Glass effects (may be laggy on old PCs)",
                      vi: "Hiệu ứng kính (gây lag trên máy yếu)",
                    })}
                  </span>
                </div>
                <button
                  onClick={() => setEnableGlassEffects(!enableGlassEffects)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all cursor-pointer hover:bg-white/20 ${
                    enableGlassEffects
                      ? "bg-primary/20 border-primary/50 text-primary"
                      : "bg-white/5 border-white/10 text-text-secondary"
                  }`}
                >
                  <Zap
                    className={`w-4 h-4 ${enableGlassEffects ? "fill-current" : ""}`}
                  />
                  <span className="text-xs font-bold">
                    {enableGlassEffects
                      ? ti({ en: "ON", vi: "BẬT" })
                      : ti({ en: "OFF", vi: "TẮT" })}
                  </span>
                </button>
              </div>
            </div>

            <div className="h-px bg-white/10 my-4" />

            {/* Username Change */}
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium text-text-secondary mb-2">
                  {ti({ en: "Your Identity", vi: "Danh tính của bạn" })}
                </div>
                <div className="text-md text-text-muted mt-1 font-mono bg-black/20 p-2 rounded">
                  {username}
                </div>
              </div>

              <div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) =>
                      setNewUsername(
                        e.target.value
                          .normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, ""),
                      )
                    }
                    placeholder={ts({
                      en: "Enter new username",
                      vi: "Nhập tên mới",
                    })}
                    maxLength={20}
                    className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary min-w-0"
                  />
                  <button
                    onClick={handleChangeUsername}
                    disabled={
                      !newUsername.trim() || newUsername.trim().length < 2
                    }
                    className="px-3 py-2 bg-primary hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                    title={ts({ en: "Save Username", vi: "Lưu tên" })}
                  >
                    <Save className="w-4 h-4" />
                  </button>
                  {/* Random btn */}
                  <button
                    onClick={() => {
                      setNewUsername(generateRandomUsername(undefined, false));
                    }}
                    className="px-3 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    <Dices className="w-4 h-4" />
                  </button>
                </div>

                {/* Preview */}
                {previewUsername && (
                  <div className="mt-2 bg-primary/10 border border-primary/20 rounded-lg p-2">
                    <p className="text-xs text-text-muted">
                      {ti({ en: "Preview:", vi: "Xem trước:" })}
                    </p>
                    <p className="text-sm font-bold font-mono text-primary">
                      {previewUsername}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
