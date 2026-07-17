import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: [
      "rutas.cybernovatech.space",
      "llegar-destino.cybernovatech.space",
      "llegar_destino.cybernovatech.space",
    ],
  },
});
