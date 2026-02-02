import {
  X,
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle,
  Loader,
} from "lucide-react";
import { useAlertStore } from "../stores/alertStore";
import useLanguage from "../stores/languageStore";
import Portal from "./Portal";

export default function AlertModal() {
  const { ti } = useLanguage();
  const {
    isOpen,
    message,
    type,
    title,
    hide,
    onConfirm,
    showCancelButton,
    resolveConfirm,
  } = useAlertStore();

  if (!isOpen) return null;

  const handleClose = () => {
    hide();
    if (resolveConfirm) resolveConfirm(false);
  };

  const handleConfirmAction = () => {
    if (onConfirm) onConfirm();
    if (resolveConfirm) resolveConfirm(true);
    hide();
  };

  const getIcon = () => {
    switch (type) {
      case "error":
        return <AlertCircle className="w-12 h-12 text-red-500 animate-pulse" />;
      case "success":
        return <CheckCircle className="w-12 h-12 text-green-500" />;
      case "warning":
        return <AlertTriangle className="w-12 h-12 text-yellow-500" />;
      case "loading":
        return (
          <Loader className="w-12 h-12 text-primary animate-[spin_2.5s_ease-in-out_infinite]" />
        );
      default:
        return <Info className="w-12 h-12 text-primary" />;
    }
  };

  const getTitle = () => {
    if (title) return title;
    switch (type) {
      case "error":
        return "Error";
      case "success":
        return "Success";
      case "warning":
        return "Warning";
      case "loading":
        return "Loading";
      default:
        return "Information";
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-100 animate-fadeIn">
        <div className="bg-background-secondary border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl mx-4 animate-scaleIn relative">
          <button
            onClick={hide}
            className="absolute top-4 right-4 p-1 hover:bg-white/10 rounded-lg transition-colors text-text-secondary"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col items-center text-center gap-4">
            <div className="p-3 bg-white/5 rounded-full">{getIcon()}</div>

            <div className="space-y-2">
              <h3 className="text-xl font-display text-text-primary">
                {getTitle()}
              </h3>
              <p className="text-text-secondary text-sm leading-relaxed">
                {message}
              </p>
            </div>

            <div className="flex w-full gap-3 mt-2">
              {showCancelButton && (
                <button
                  onClick={handleClose}
                  className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-text-secondary font-medium rounded-xl transition-colors"
                >
                  {ti({ en: "Cancel", vi: "Hủy" })}
                </button>
              )}
              <button
                onClick={handleConfirmAction}
                className={`flex-1 py-2.5 bg-primary hover:bg-primary-light text-white font-medium rounded-xl transition-all shadow-lg shadow-primary/20 ${
                  !showCancelButton ? "w-full" : ""
                }`}
              >
                {showCancelButton
                  ? ti({ en: "Confirm", vi: "Xác nhận" })
                  : ti({ en: "Okay", vi: "Okay" })}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
