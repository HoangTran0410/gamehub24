import { useState, useEffect } from "react";
import { User } from "lucide-react";
import useLanguage from "../stores/languageStore";
import { cleanName, generateSuffix } from "../stores/userStore";

interface UsernameModalProps {
  onSubmit: (username: string) => void;
  defaultUsername?: string;
}

export default function UsernameModal({
  onSubmit,
  defaultUsername = "",
}: UsernameModalProps) {
  const [inputValue, setInputValue] = useState(defaultUsername);
  const [previewUsername, setPreviewUsername] = useState("");
  const { ti, ts } = useLanguage();

  // Update preview whenever input changes
  useEffect(() => {
    const trimmed = inputValue.trim();
    if (trimmed) {
      setPreviewUsername(`${cleanName(trimmed)}${generateSuffix()}`);
    } else {
      setPreviewUsername("");
    }
  }, [inputValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed) {
      const finalUsername = `${cleanName(trimmed)}${generateSuffix()}`;
      onSubmit(finalUsername);
    }
  };

  const isValid =
    inputValue.trim().length >= 2 && inputValue.trim().length <= 20;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-100 animate-fadeIn">
      <div className="bg-background-secondary border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl mx-4 animate-scaleIn">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary">
            <User className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-display text-text-primary mb-2">
            {ti({
              en: "Welcome to GameHub24",
              vi: "Chào mừng đến GameHub24",
            })}
          </h2>
          <p className="text-text-secondary">
            {ti({
              en: "Enter your username to get started",
              vi: "Nhập tên của bạn để bắt đầu",
            })}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {ti({ en: "Username", vi: "Tên người dùng" })}
            </label>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={ts({
                en: "Enter your desired username",
                vi: "Nhập tên bạn muốn",
              })}
              autoFocus
              maxLength={20}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <p className="text-xs text-text-muted mt-1">
              {ti({
                en: "2-20 characters. Random numbers will be added automatically.",
                vi: "2-20 ký tự. Số ngẫu nhiên sẽ được thêm tự động.",
              })}
            </p>
          </div>

          {/* Preview */}
          {previewUsername && (
            <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
              <p className="text-xs text-text-muted mb-1">
                {ti({ en: "Preview:", vi: "Xem trước:" })}
              </p>
              <p className="text-lg font-bold font-mono text-primary">
                {previewUsername}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={!isValid}
            className="w-full px-4 py-3 bg-primary hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all cursor-pointer"
          >
            {ti({ en: "Continue", vi: "Tiếp tục" })}
          </button>
        </form>

        <p className="text-xs text-text-muted text-center mt-4">
          {ti({
            en: "You can change this later in settings",
            vi: "Bạn có thể thay đổi sau trong cài đặt",
          })}
        </p>
      </div>
    </div>
  );
}
