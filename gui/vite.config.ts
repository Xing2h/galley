import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // Manual chunking of large vendor deps so the main bundle stays
  // small and each vendor slice caches independently across app
  // updates (a markdown-render fix shouldn't force users to re-fetch
  // Shiki's grammars, and vice versa). Grouped by ecosystem, not by
  // individual package, to keep the chunk count bounded.
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // Markdown pipeline (react-markdown + remark + Shiki +
          // oniguruma WASM). Heavy and only grows with content; keep
          // it isolated from app code churn.
          if (
            /[\\/]node_modules[\\/](react-markdown|remark|rehype|unified|micromark|shiki|vscode-oniguruma)[\\/]/.test(
              id,
            )
          ) {
            return "markdown";
          }
          // Radix primitives — the dialog / context-menu / dropdown
          // surface, second-largest vendor cluster after react itself.
          if (id.includes("@radix-ui")) {
            return "radix";
          }
          // Phosphor icon set — tree-shaken per-icon at the JS level
          // but the shared runtime is a clean seam.
          if (id.includes("@phosphor-icons")) {
            return "icons";
          }
          return undefined;
        },
      },
    },
  },
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching the Rust side (now at ../core)
      ignored: ["**/core/**"],
    },
  },
}));
