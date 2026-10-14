import { defineConfig } from "@playwright/test";

/**
 * Browser tests for the main flows. They start their own backend on port 8100, with a throwaway database and no
 * AI or Telegram keys, so they never touch your real data or spend anything, and their own frontend on port 5199.
 *
 *   npm run test:e2e
 *
 * They use the Google Chrome installed on this computer, so no separate browser download is needed.
 */
const backendPort = 8100;
const frontendPort = 5199;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${frontendPort}`,
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      cwd: "backend",
      // A fresh database every run, kept under backend/data (which git ignores).
      command: `sh -c "rm -rf data/e2e && mkdir -p data/e2e/chroma && exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port ${backendPort}"`,
      url: `http://127.0.0.1:${backendPort}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DATABASE_URL: "sqlite:///data/e2e/app.db",
        CHROMA_PERSIST_DIR: "./data/e2e/chroma",
        // Blank keys switch the AI and the bot off, so the tests also check the app's fallbacks.
        OPENAI_API_KEY: "",
        TELEGRAM_BOT_TOKEN: "",
        FRONTEND_ORIGIN: `http://localhost:${frontendPort}`,
      },
    },
    {
      command: `npx vite --port ${frontendPort} --strictPort`,
      url: `http://localhost:${frontendPort}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_TARGET: `http://127.0.0.1:${backendPort}` },
    },
  ],
});
