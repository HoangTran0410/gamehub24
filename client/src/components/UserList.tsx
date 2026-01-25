import { useState } from "react";
import useLanguage from "../stores/languageStore";
import { useRoomStore } from "../stores/roomStore";
import { useUserStore } from "../stores/userStore";
import { getSocket } from "../services/socket";
import {
  AlertCircle,
  ArrowDownFromLine,
  ArrowUpFromLine,
  Ban,
  ChevronDown,
  ChevronUp,
  Crown,
  Share2,
} from "lucide-react";
import { useAlertStore } from "../stores/alertStore";
import ShareModal from "./ShareModal";
import { createPortal } from "react-dom";

export default function UserList() {
  const { currentRoom } = useRoomStore();
  const { userId } = useUserStore();
  const { confirm: showConfirm, show: showAlert } = useAlertStore();
  const { ti, ts } = useLanguage();
  const socket = getSocket();

  const [playersExpanded, setPlayersExpanded] = useState(true);
  const [spectatorsExpanded, setSpectatorsExpanded] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);

  if (!currentRoom) return null;

  const isHost = currentRoom.ownerId === userId;
  const players = currentRoom.players || [];
  const spectators = currentRoom.spectators || [];

  const handleKickUser = async (targetId: string, name: string) => {
    if (
      !(await showConfirm(
        ts({
          en: `Kick ${name} from the room?`,
          vi: `Đuổi ${name} khỏi phòng?`,
        }),
        ts({ en: "Kick", vi: "Đuổi" }),
      ))
    )
      return;

    socket.emit(
      "room:kick",
      { roomId: currentRoom.id, userId: targetId },
      (response: any) => {
        if (!response.success && response.error) {
          showAlert(response.error, { type: "error" });
        } else {
          showAlert(ts({ en: "Kicked", vi: "Đã đuổi" }) + ` ${name}`, {
            type: "success",
          });
        }
      },
    );
  };

  const handleMoveToSpectator = async (targetId: string, name: string) => {
    if (
      !(await showConfirm(
        ts({
          en: `Move ${name} to spectator?`,
          vi: `Chuyển ${name} sang khán giả?`,
        }),
        ts({ en: "Move to spectator", vi: "Chuyển sang khán giả" }),
      ))
    )
      return;
    socket.emit(
      "room:removePlayer",
      {
        roomId: currentRoom.id,
        userId: targetId,
      },
      (response: any) => {
        if (!response.success && response.error) {
          showAlert(response.error, { type: "error" });
        }
      },
    );
  };

  const handleAddToGame = async (targetId: string, name: string) => {
    if (
      !(await showConfirm(
        ts({
          en: `Move ${name} to players?`,
          vi: `Chuyển ${name} thành người chơi?`,
        }),
        ts({ en: "Move to players", vi: "Chuyển thành người chơi" }),
      ))
    )
      return;

    socket.emit(
      "room:addPlayer",
      { roomId: currentRoom.id, userId: targetId },
      (response: any) => {
        if (!response.success && response.error) {
          showAlert(response.error, { type: "error" });
        }
      },
    );
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 min-h-[80vh] md:min-h-[200px]">
      {showShareModal &&
        createPortal(
          <ShareModal
            roomId={currentRoom?.id || ""}
            onClose={() => setShowShareModal(false)}
          />,
          document.body,
        )}

      {/* Invite user button */}
      {currentRoom?.isOffline ? (
        <div className="flex items-center justify-center gap-2 mt-2">
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 rounded-lg">
            <AlertCircle className="w-4 h-4 text-orange-400" />
            <span className="text-sm text-orange-300">
              {ti({
                en: "Cannot invite to Offline room",
                vi: "Không thể mời vào phòng Offline",
              })}
            </span>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowShareModal(true)}
          className="w-full py-2.5 flex items-center justify-center gap-2 font-medium rounded-xl transition-all bg-primary hover:bg-primary-light text-white shadow-lg shadow-primary/20"
        >
          <Share2 className="w-5 h-5" />
          {ti({ en: "Invite", vi: "Mời" })}
        </button>
      )}

      {/* Players Section */}
      <div className="flex flex-col gap-2">
        <div
          className="flex items-center justify-between px-2 py-1 hover:bg-white/5 rounded cursor-pointer select-none"
          onClick={() => setPlayersExpanded(!playersExpanded)}
        >
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
            {ti({
              en: `Players (${players.length}/${currentRoom.maxPlayers})`,
              vi: `Người chơi (${players.length}/${currentRoom.maxPlayers})`,
            })}
          </span>
          {playersExpanded ? (
            <ChevronUp className="w-3 h-3 text-text-muted" />
          ) : (
            <ChevronDown className="w-3 h-3 text-text-muted" />
          )}
        </div>

        {playersExpanded && (
          <div className="space-y-1">
            {players.map((p) => (
              <div
                key={p.id}
                className="group flex items-center justify-between p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Avatar/Icon */}
                  <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                    {p.isHost ? (
                      <Crown className="w-4 h-4 text-white" />
                    ) : (
                      <span className="text-xs font-bold text-white">
                        {p.username.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-text-primary truncate">
                      {p.username}
                      {p.id === userId && (
                        <span className="text-text-muted text-xs ml-1">
                          {ti({ en: "(You)", vi: "(Bạn)" })}
                        </span>
                      )}
                    </span>
                    {p.isHost && (
                      <span className="text-[10px] text-yellow-500 font-bold tracking-wide text-left">
                        HOST
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {isHost && p.id !== userId && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleMoveToSpectator(p.id, p.username)}
                      className="p-1.5 text-orange-400 hover:bg-orange-400/10 rounded-lg transition-colors"
                      title={ts({
                        en: "Move to Spectators",
                        vi: "Chuyển sang khán giả",
                      })}
                    >
                      <ArrowDownFromLine className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleKickUser(p.id, p.username)}
                      className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                      title={ts({ en: "Kick", vi: "Đuổi" })}
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Spectators Section */}
      <div className="flex flex-col gap-2">
        <div
          className="flex items-center justify-between px-2 py-1 hover:bg-white/5 rounded cursor-pointer select-none"
          onClick={() => setSpectatorsExpanded(!spectatorsExpanded)}
        >
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
            {ti({
              en: `Spectators (${spectators.length})`,
              vi: `Khán giả (${spectators.length})`,
            })}
          </span>
          {spectatorsExpanded ? (
            <ChevronUp className="w-3 h-3 text-text-muted" />
          ) : (
            <ChevronDown className="w-3 h-3 text-text-muted" />
          )}
        </div>

        {spectatorsExpanded && (
          <div className="space-y-1">
            {spectators.length === 0 && (
              <div className="text-xs text-text-muted italic px-2 py-1">
                {ti({ en: "No spectators", vi: "Không có khán giả" })}
              </div>
            )}

            {spectators.map((s) => (
              <div
                key={s.id}
                className="group flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center">
                    <span className="text-xs font-bold text-text-muted">
                      {s.username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm text-text-secondary truncate">
                    {s.username}
                    {s.id === userId && (
                      <span className="text-text-muted text-xs ml-1">
                        {ti({ en: "(You)", vi: "(Bạn)" })}
                      </span>
                    )}
                  </span>
                </div>

                {/* Actions */}
                {isHost && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleAddToGame(s.id, s.username)}
                      className="p-1.5 text-green-400 hover:bg-green-400/10 rounded-lg transition-colors"
                      title={ts({ en: "Add to Game", vi: "Thêm vào game" })}
                    >
                      <ArrowUpFromLine className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleKickUser(s.id, s.username)}
                      className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                      title={ts({ en: "Kick", vi: "Đuổi" })}
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
