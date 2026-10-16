import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    // Médias des tests : stockage sur disque dans un dossier temporaire.
    env: { MEDIA_LOCAL_DIR: join(tmpdir(), `gps-test-media-${process.pid}`) },
  },
});
