import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { viteSingleFile } from "vite-plugin-singlefile"

// `--mode single` inlines every asset into dist-single/index.html so the whole studio can be
// published as one self-contained page (Claude Artifact, e-mail attachment, offline projector).
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === "single" ? [viteSingleFile()] : [])],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  build: { outDir: mode === "single" ? "dist-single" : "dist", chunkSizeWarningLimit: 2000 },
}))
