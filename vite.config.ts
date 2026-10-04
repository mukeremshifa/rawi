import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    proxy: {
      /* The local AI server. The browser only ever talks to the dev origin. */
      "/api": { target: mode === 'backend' ? "http://127.0.0.1:8788" : "http://127.0.0.1:8787", changeOrigin: false },
    },
  },
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "@": fileURLToPath(new URL("./src/client", import.meta.url)),
    },
  },
}));
