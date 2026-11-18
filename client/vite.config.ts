import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Portas diferentes do projeto TTLock (3001/5173) para os dois rodarem lado a lado.
const API_TARGET = process.env.VITE_API_TARGET || "http://localhost:3002";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    // Mesma origem em dev: o navegador chama /api e /db e o Vite repassa ao Express.
    proxy: {
      "/api": API_TARGET,
      "/db": API_TARGET,
    },
  },
});
