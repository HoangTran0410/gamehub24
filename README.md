# 🎮 GameHub
> **Real-time multiplayer gaming platform for everyone**

### [🎯 Play Now](https://gamehub24.pages.dev)

![GameHub Banner](https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=2070&auto=format&fit=crop)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=HoangTran0410/gamehub24&type=date&legend=top-left)](https://www.star-history.com/#HoangTran0410/gamehub24&type=date&legend=top-left)

---

## 📖 Giới Thiệu / Overview
**GameHub** là nền tảng game trình duyệt đa người chơi thời gian thực. Được thiết kế với phong cách Glassmorphism hiện đại, tối ưu cho cả Desktop và Mobile.

### ✨ Điểm Nổi Bật / Highlights
- 🎮 **15+ Games**: Chess, UNO, Werewolf, Ludo, Maze, Billiard...
- 🤖 **Smart Bots**: Tích hợp AI (Stockfish, Minimax) chơi solo.
- ⚡ **Real-time**: Đồng bộ tức thì qua Socket.IO với cơ chế Patch Compaction cực nhẹ.
- 🏠 **Flexible Rooms**: Phòng công khai hoặc riêng tư có mật khẩu.
- 💬 **Live Chat**: Chat tổng hoặc chat nội bộ trong từng phòng game.

---

## 🏗️ Cấu Trúc / Structure
- [**Client** (React)](./client/README.md): Giao diện và Logic game (Host-authoritative).
- [**Server** (Node.js)](./server/README.md): Relay server điều phối dữ liệu.
- [**Game Architecture**](./client/src/games/README.md): Hướng dẫn tạo game mới.

---

## 🚀 Cài Đặt / Quick Start
Yêu cầu: **Node.js v18+** hoặc **Bun**.

```bash
# 1. Clone & Install
git clone https://github.com/HoangTran0410/gamehub24.git
cd gamehub
bun install # hoặc npm install ở từng thư mục client/server

# 2. Chạy Dev (Terminal 1 - Server)
cd server && bun run dev

# 3. Chạy Dev (Terminal 2 - Client)
cd client && bun run dev
```
Mở trình duyệt tại: `http://localhost:5173`

---

## ️ Tech Stack
- **Frontend**: React 19, TypeScript, Zustand, Tailwind CSS 4.
- **Backend**: Node.js, Express, Socket.IO.
- **AI**: Stockfish.js, Minimax Algorithm.
- **UI/UX**: Lucide Icons, Modern Glassmorphism Design.

---

## 🤝 Đóng Góp / Contributing
Chúng mình luôn hoan nghênh các đóng góp mới!
1. Fork repository.
2. Tạo branch mới (`feature/AmazingFeature`).
3. Commit và Push lên branch của bạn.
4. Mở một Pull Request.

---

## 📄 License
Distributed under the **MIT License**.

<div align="center">
Built with ❤️ by <b>Hoang Tran</b>
</div>
