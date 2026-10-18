import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/health": "http://127.0.0.1:8000",
      "/games": "http://127.0.0.1:8000",
      "/players": "http://127.0.0.1:8000",
      "/seasons": "http://127.0.0.1:8000",
      "/shots": "http://127.0.0.1:8000",
      "/standings": "http://127.0.0.1:8000",
      "/teams": "http://127.0.0.1:8000",
    },
  },
});
