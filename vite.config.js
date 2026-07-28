import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["logo.jpeg"],
      manifest: {
        name: "Farm Manager",
        short_name: "Farm Mgr",
        description: "Farm accounting and management",
        theme_color: "#1e3a5f",
        background_color: "#f4f6fa",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/logo.jpeg", sizes: "192x192", type: "image/jpeg" },
          { src: "/logo.jpeg", sizes: "512x512", type: "image/jpeg" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,jpeg,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: { cacheName: "supabase-cache", networkTimeoutSeconds: 10 },
          },
        ],
      },
    }),
  ],
});
