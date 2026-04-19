import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import dotenv from "dotenv";

// Load local .env (next to this config) into process.env so the config
// can read `PORT` and `BASE_PATH` synchronously during config evaluation.
// Prefer the project's working directory so bundled/temp configs still
// load the correct `.env` when Vite creates a temp copy of this file.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const rawPort = process.env.PORT;
if (!rawPort) throw new Error("PORT environment variable is required.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT: "${rawPort}"`);

const basePath = process.env.BASE_PATH;
if (!basePath) throw new Error("BASE_PATH environment variable is required.");
// The Replit runtime overlay can throw AudioContext resume errors in local dev,
// so only enable it when running inside Replit.
const isReplitDev =
  process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined;

export default defineConfig({
  base: basePath,
  envDir: path.resolve(import.meta.dirname),
  plugins: [
    react(),
    tailwindcss(),
    ...(isReplitDev ? [runtimeErrorOverlay()] : []),
    ...(isReplitDev
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            })
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner()
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "attached_assets"
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  // Tell Vite to pre-bundle the CJS GuildCraft SDK so it works in ESM context
  optimizeDeps: {
    include: ["@adarsh23/guildcraft-sdk"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    commonjsOptions: {
      include: [/@adarsh23\/guildcraft-sdk/, /node_modules/],
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: { strict: true, deny: ["**/.*"] },
    proxy: {
      "/api/world-events": {
        target: "http://localhost:3002",
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  preview: { port, host: "0.0.0.0", allowedHosts: true },
});