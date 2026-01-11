# 🎮 Game Hub

A real-time multiplayer game platform built with React, Socket.IO, and modern web technologies. Play various games with friends in a vibrant, gaming-themed interface.

## ✨ Features (Phase 1 - MVP)

### Core Functionality
- **User Sessions**: Persistent anonymous user IDs stored in localStorage
- **Room Management**: Create and join public/private rooms with password protection
- **Real-time Chat**: In-room messaging with player status indicators
- **Host-Client Architecture**: First player becomes host and manages game state
- **Live Updates**: Real-time room list updates and player presence
- **AI Opponent**: Single-player mode vs Stockfish engine (100MB+ WASM integration)
- **Settings System**: Dynamic server configuration and identity management
- **Global Alerts**: Unified modal system for notifications and confirmations

### UI/UX
- **Dark Mode OLED Design**: Eye-friendly gaming aesthetic
- **Vibrant Purple Theme**: Neon accents with glassmorphism effects
- **Responsive Layout**: Mobile-first design, works on all devices
- **Accessibility**: WCAG AAA compliant, keyboard navigation support
- **Custom Typography**: Russo One + Chakra Petch font pairing

## 🛠️ Tech Stack

### Frontend
- **React 19** + **TypeScript**
- **Vite** - Lightning-fast build tool
- **Tailwind CSS 4** - Utility-first styling
- **Socket.IO Client** - Real-time communication
- **Zustand** - State management
- **React Router** - Client-side routing
- **Lucide React** - Beautiful SVG icons

### Backend
- **Node.js** + **Express**
- **Socket.IO** - WebSocket server
- **TypeScript** - Type safety
- **In-memory storage** - Room and chat data (MVP)

## 📦 Project Structure

```
gamehub/
├── client/                     # React frontend
│   ├── src/
│   │   ├──components/
│   │   │   ├── chat/           # Chat components
│   │   │   ├── common/         # Reusable components
│   │   │   ├── lobby/          # Lobby components
│   │   │   └── room/           # Room components
│   │   ├── games/              # Game modules (to be implemented)
│   │   ├── pages/
│   │   │   ├── Lobby.tsx       # Main lobby page
│   │   │   └── Room.tsx        # Game room page
│   │   ├── stores/             # Zustand stores
│   │   │   ├── userStore.ts    # User session
│   │   │   ├── roomStore.ts    # Room state
│   │   │   ├── chatStore.ts    # Chat messages
│   │   │   └── gameStore.ts    # Game instance
│   │   ├── services/
│   │   │   └── socket.ts       # Socket.IO client
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── .env                    # Environment variables
│   ├── tailwind.config.ts      # Tailwind configuration
│   └── vite.config.ts          # Vite configuration
│
└── server/                     # Node.js backend
    ├── src/
    │   ├── managers/
    │   │   └── RoomManager.ts  # Room lifecycle management
    │   ├── types/
    │   │   └── index.ts        # Shared types
    │   └── server.ts           # Main server file
    ├── .env                    # Environment variables
    └── tsconfig.json           # TypeScript configuration
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ installed
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd gamehub
   ```

2. **Install server dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Install client dependencies**
   ```bash
   cd ../client
   npm install
   ```

### Running Locally

1. **Start the server** (Terminal 1)
   ```bash
   cd server
   npm run dev
   ```
   Server will run on `http://localhost:3001`

2. **Start the client** (Terminal 2)
   ```bash
   cd client
   npm run dev
   ```
   Client will run on `http://localhost:5173`

3. **Open your browser**
   Navigate to `http://localhost:5173`

## 🌐 Deployment

### Deploy Frontend (GitHub Pages)

1. **Build the client**
   ```bash
   cd client
   npm run build
   ```

2. **Deploy to GitHub Pages**
   - Push the `dist` folder to `gh-pages` branch, or
   - Use GitHub Actions (workflow template included in implementation plan)

3. **Configure server URL**
   - Set `VITE_SOCKET_URL` in `.env` to your production server URL
   - Or use the Settings modal in the app to configure it dynamically

### Deploy Backend

**Recommended hosting options:**
- [Railway](https://railway.app/) - One-click deploy
- [Render](https://render.com/) - Free tier available
- [Fly.io](https://fly.io/) - Global edge network
- AWS/DigitalOcean/Heroku - Traditional hosting

**Environment variables:**
```env
PORT=3001
CLIENT_URL=https://your-github-pages-url
NODE_ENV=production
```

## 🎨 Design System

Full design system documentation available in `.gemini/antigravity/brain/*/design_system.md`

### Color Palette
- **Primary**: `#7C3AED` (Purple 600)
- **Accent**: `#F43F5E` (Rose 500)
- **Neon Green**: `#00FF00`
- **Neon Cyan**: `#00FFFF`
- **Background**: `#0F0F23` (Deep dark)
- **Text**: `#E2E8F0` (Slate 200)

### Typography
- **Display**: Russo One (headings)
- **Body**: Chakra Petch (text)

## 📝 Next Steps (Phase 2+)

### Game Modules
- [x] Implement Caro (Gomoku) game
- [x] Implement Chess game
- [x] Create BaseGame abstract class
- [x] Create game registry system
- [ ] Implement host-client synchronization

### Features
- [ ] Spectator mode
- [ ] Game history/replays
- [ ] Player statistics
- [ ] Room persistence (database)
- [ ] User profiles and avatars
- [ ] Friend system
- [ ] Game invitations

### Polish
- [ ] Add sounds/music
- [ ] Leaderboards
- [ ] Achievements/badges
- [ ] Tutorial/onboarding
- [ ] Internationalization (i18n)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Design inspired by modern gaming platforms
- UI/UX research powered by UI Pro Max workflow
- Built with ❤️ using React and Socket.IO

---

**Live Demo**: Coming soon!
**Status**: Phase 1 (MVP) Complete ✅

