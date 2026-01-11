import { useEffect } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { initSocket, connectSocket } from "./services/socket";
import AlertModal from "./components/AlertModal";
import Lobby from "./pages/Lobby";
import Room from "./pages/Room";
import "./App.css";

function App() {
  useEffect(() => {
    // Initialize and connect socket on app mount
    initSocket();
    connectSocket();
  }, []);

  return (
    <HashRouter>
      <AlertModal />
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/room/:roomId" element={<Room />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
