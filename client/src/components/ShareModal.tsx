import { useState } from "react";
import useLanguage from "../stores/languageStore";
import { Check, Copy, Share2, X } from "lucide-react";

export default function ShareModal({
  roomId,
  onClose,
}: {
  roomId: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { ti } = useLanguage();

  const roomLink = window.location.hash.includes("#")
    ? `${window.location.origin}/${window.location.hash}`
    : `${window.location.origin}/#/room/${roomId}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(roomLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-100 animate-fadeIn">
      <div className="bg-background-secondary border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl mx-4 animate-scaleIn relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 hover:bg-white/10 rounded-lg transition-colors text-text-secondary"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center gap-4">
          <div className="p-3 bg-white/5 rounded-full">
            <Share2 className="w-10 h-10 text-primary" />
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-display text-text-primary">
              {ti({ en: "Invite to Room", vi: "Mời vào phòng" })}
            </h3>
            <p className="text-text-secondary text-sm">
              {ti({
                en: "Invite friends to join by sharing this link",
                vi: "Mời bạn bè tham gia bằng cách chia sẻ link này",
              })}
            </p>
          </div>

          <div className="w-full space-y-3">
            <div className="flex items-center gap-2 p-3 bg-white/5 rounded-lg">
              <input
                type="text"
                value={roomLink}
                readOnly
                className="flex-1 bg-transparent text-text-primary text-sm outline-none"
              />
            </div>

            <button
              onClick={handleCopyLink}
              className={`w-full py-2.5 flex items-center justify-center gap-2 font-medium rounded-xl transition-all ${
                copied
                  ? "bg-green-600 text-white"
                  : "bg-primary hover:bg-primary-light text-white shadow-lg shadow-primary/20"
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-5 h-5" />
                  {ti({ en: "Copied!", vi: "Đã copy!" })}
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5" />
                  {ti({ en: "Copy Link", vi: "Copy link" })}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
