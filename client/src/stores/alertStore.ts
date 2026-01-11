import { create } from "zustand";

type AlertType = "error" | "info" | "success" | "warning" | "loading";

interface AlertState {
  isOpen: boolean;
  message: string;
  type: AlertType;
  title?: string;
  onConfirm?: () => void;
  showCancelButton?: boolean;
  resolveConfirm?: (value: boolean) => void;
  show: (
    message: string,
    options?: {
      type?: AlertType;
      title?: string;
      onConfirm?: () => void;
    }
  ) => void;
  confirm: (message: string, title?: string) => Promise<boolean>;
  hide: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  isOpen: false,
  message: "",
  type: "info",
  title: undefined,
  onConfirm: undefined,
  showCancelButton: false,
  resolveConfirm: undefined,
  show: (message, options) =>
    set({
      isOpen: true,
      message,
      type: options?.type || "info",
      title: options?.title,
      onConfirm: options?.onConfirm,
      showCancelButton: false,
    }),
  confirm: (message, title) => {
    return new Promise((resolve) => {
      set({
        isOpen: true,
        message,
        type: "warning",
        title: title || "Confirm",
        showCancelButton: true,
        resolveConfirm: resolve,
      });
    });
  },
  hide: () =>
    set({
      isOpen: false,
      message: "",
      onConfirm: undefined,
      resolveConfirm: undefined,
    }),
}));
