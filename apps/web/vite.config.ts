import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["apple-touch-icon.png", "favicon.svg", "pwa-192.png", "pwa-512.png"],
      manifest: {
        id: "/",
        name: "ELB V1",
        short_name: "ELB V1",
        description: "ELB V1 fuer Dossiers, ELB-PDF und Schaetzlisten.",
        theme_color: "#17372f",
        background_color: "#f8f5ef",
        display: "standalone",
        start_url: "/",
        lang: "de-CH",
        orientation: "portrait",
        icons: [
          {
            src: "/pwa-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,pdf,docx,mjs}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "pages"
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@elb/client-app": path.resolve(__dirname, "../../packages/client-app/src"),
      "@elb/app-core": path.resolve(__dirname, "../../packages/app-core/src"),
      "@elb/domain": path.resolve(__dirname, "../../packages/domain/src"),
      "@elb/export-core": path.resolve(__dirname, "../../packages/export-core/src"),
      "@elb/persistence": path.resolve(__dirname, "../../packages/persistence/src"),
      "@elb/pdf-core": path.resolve(__dirname, "../../packages/pdf-core/src"),
      "@elb/shared": path.resolve(__dirname, "../../packages/shared/src"),
      "@elb/ui": path.resolve(__dirname, "../../packages/ui/src"),
      "@elb/word-core": path.resolve(__dirname, "../../packages/word-core/src")
    }
  }
});
