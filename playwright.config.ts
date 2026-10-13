import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Chromium préinstallé dans certains environnements ; sinon celui de Playwright.
const localChromium = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const launchOptions = existsSync(localChromium) ? { executablePath: localChromium } : {};
const PORT = 3200;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, locale: "fr-FR", launchOptions, trace: "retain-on-failure" },
  projects: [
    { name: "ordinateur", use: { ...devices["Desktop Chrome"], launchOptions }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    // Base de démonstration neuve à chaque lancement, isolée de la base locale.
    command: `rm -rf .data/e2e && next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    // E2E_DATABASE_URL : exécuter les parcours sur un vrai PostgreSQL (base vidée au préalable).
    env: {
      PGLITE_DIR: ".data/e2e",
      DEMO_MODE: "true",
      ...(process.env.E2E_DATABASE_URL ? { DATABASE_URL: process.env.E2E_DATABASE_URL } : {}),
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
