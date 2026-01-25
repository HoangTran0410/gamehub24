import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIME__: Date.now(),
  },
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  base: "./",
  build: {
    outDir: "../",
    emptyOutDir: false,
    assetsDir: "built",
    minify: "terser",
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": [
            "react",
            "react-dom",
            "react-router-dom",
            "lucide-react",
          ],
          socket: ["socket.io-client"],
          zustand: ["zustand"],
          chess: ["chess.js"],
          chessground: ["chessground"],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
      },
    },
  },
});
