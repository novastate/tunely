import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3456",
  },
  webServer: {
    command: "npx next dev -p 3456",
    url: "http://localhost:3456",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
