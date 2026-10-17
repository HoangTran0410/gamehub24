# GameHub

> Real-time multiplayer gaming platform for everyone

### [Play Now](https://gamehub24.pages.dev)

<!-- aio-desktop-badge:start -->
[![AIO Desktop](https://img.shields.io/badge/Try-AIO_Desktop-7c3aed?style=for-the-badge&logo=googlechrome&logoColor=white)](https://fbaio.org/#/desktop)
<!-- aio-desktop-badge:end -->

![GameHub Banner](https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=2070&auto=format&fit=crop)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=HoangTran0410/gamehub24&type=date&legend=top-left)](https://www.star-history.com/#HoangTran0410/gamehub24&type=date&legend=top-left)

---

## Overview

**GameHub** is a real-time multiplayer browser gaming platform featuring a modern Glassmorphism design, optimized for both desktop and mobile.

### Highlights

- **15+ Games**: Chess, UNO, Werewolf, Ludo, Maze, Billiard, and more
- **Smart Bots**: AI integration (Stockfish, Minimax) for solo play
- **Real-time Sync**: Instant synchronization via Socket.IO with lightweight Patch Compaction
- **Flexible Rooms**: Public or password-protected private rooms
- **Live Chat**: Global chat and in-room messaging

---

## Project Structure

| Directory | Description |
|-----------|-------------|
| [**client/**](./client/README.md) | React frontend with game UI and host-authoritative logic |
| [**server/**](./server/README.md) | Relay server for data coordination |
| [**client/src/games/**](./client/src/games/README.md) | Game architecture and how to create new games |

---

## Quick Start

**Requirements**: Node.js v18+ or Bun

```bash
# 1. Clone & Install
git clone https://github.com/HoangTran0410/gamehub24.git
cd gamehub
bun install  # or run npm install in client/ and server/ separately

# 2. Start Server (Terminal 1)
cd server && bun run dev

# 3. Start Client (Terminal 2)
cd client && bun run dev
```

Open your browser at: `http://localhost:5173`

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Zustand, Tailwind CSS 4
- **Backend**: Node.js, Express, Socket.IO
- **AI**: Stockfish.js, Minimax Algorithm
- **UI/UX**: Lucide Icons, Modern Glassmorphism Design

---

## Contributing

Contributions are welcome!

1. Fork the repository
2. Create a new branch (`feature/AmazingFeature`)
3. Commit and push your changes
4. Open a Pull Request

---

## License

Distributed under the **MIT License**.

<!-- aio-desktop:start -->
### 🖥️ AIO Desktop

**EN:** Find this game hub and many more free tools & games in **[AIO Desktop](https://fbaio.org/#/desktop)**, a Windows/macOS-style web desktop by Social AIO. [▶ Open AIO Desktop](https://fbaio.org/#/desktop)

**VI:** Xem game hub này cùng nhiều công cụ, trò chơi miễn phí khác trong **[AIO Desktop](https://fbaio.org/#/desktop)**, màn kiểu Windows/macOS của Social AIO. [▶ Mở AIO Desktop](https://fbaio.org/#/desktop)
<!-- aio-desktop:end -->

<div align="center">
Built with care by <b>Hoang Tran</b>
</div>
