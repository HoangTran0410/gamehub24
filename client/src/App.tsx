import { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { initSocket, connectSocket } from "./services/socket";
import { canBecomeActiveTab, acquireTabLock } from "./services/tabLock";
import { useUserStore } from "./stores/userStore";
import useLanguage from "./stores/languageStore";
import AlertModal from "./components/AlertModal";
import UsernameModal from "./components/UsernameModal";
import Lobby from "./pages/Lobby";
import Room from "./pages/Room";
import GlobalChat from "./components/GlobalChat";

export default function App() {
  const [isChecking, setIsChecking] = useState(true);
  const [isDuplicateTab, setIsDuplicateTab] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const { username, setUsername, hasHydrated } = useUserStore();
  const { ti } = useLanguage();

  useEffect(() => {
    if (!hasHydrated) return;

    // Check for duplicate tabs before connecting
    const checkTab = async () => {
      const canConnect = await canBecomeActiveTab();

      if (canConnect) {
        // Acquire the lock
        const acquired = acquireTabLock();
        if (acquired) {
          setIsDuplicateTab(false);

          // check username
          const store = useUserStore.getState();
          if (!store.username) {
            setShowUsernameModal(true);
          }
        } else {
          setIsDuplicateTab(true);
        }
      } else {
        setIsDuplicateTab(true);
      }

      setIsChecking(false);
    };

    checkTab();
  }, [hasHydrated]);

  // Connect socket when username is available
  useEffect(() => {
    if (username && !isDuplicateTab) {
      initSocket();
      connectSocket();
    }
  }, [username, isDuplicateTab]);

  // Show loading while checking
  if (isChecking || !hasHydrated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">
          {ti({ en: "Loading...", vi: "Đang tải..." })}
        </div>
      </div>
    );
  }

  // Show duplicate tab warning
  if (isDuplicateTab) {
    return <DuplicateTabWarning />;
  }

  // Show username modal if no username
  if (showUsernameModal) {
    return (
      <div className="min-h-screen bg-background-primary">
        <UsernameModal
          onSubmit={(newUsername) => {
            setUsername(newUsername);
            setShowUsernameModal(false);
          }}
        />
      </div>
    );
  }

  // Only render app when username is set
  if (!username) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">
          {ti({
            en: "Waiting for enter username...",
            vi: "Đang chờ nhập tên...",
          })}
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <AlertModal />
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/room/:roomId" element={<Room />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <GlobalChat />
    </HashRouter>
  );
}

function DuplicateTabWarning() {
  const { ti } = useLanguage();
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-xl p-8 max-w-md text-center shadow-2xl border border-slate-700">
        <div className="text-6xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold text-white mb-4">
          {ti({ en: "Game Hub Already Open", vi: "Game Hub đã mở" })}
        </h1>
        <p className="text-gray-300 mb-6">
          {ti({
            en: "You already have Game Hub open in another browser tab. Please close this tab and use the existing one to avoid connection issues.",
            vi: "Bạn đã mở Game Hub trong tab khác. Vui lòng đóng tab này và sử dụng tab hiện có để tránh lỗi kết nối.",
          })}
        </p>
        <p className="text-gray-500 text-sm">
          {ti({
            en: "Only one tab can be connected at a time to prevent duplicate players.",
            vi: "Chỉ một tab có thể kết nối để tránh người chơi trùng lặp.",
          })}
        </p>
      </div>
    </div>
  );
}
