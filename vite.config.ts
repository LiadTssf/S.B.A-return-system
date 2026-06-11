import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

// תצורת Vite — SPA נקי (ללא SSR/Cloudflare של האבטיפוס)
export default defineConfig({
  plugins: [
    // חובה לפני react — מייצר את routeTree.gen.ts מקבצי src/routes
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  server: {
    port: 5173,
  },
});
