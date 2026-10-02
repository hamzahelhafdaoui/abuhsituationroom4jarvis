import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./browser", timeout: 30000,
  webServer: {
    command: "node server.mjs", url: "http://127.0.0.1:8080", reuseExistingServer: false,
    env: { ASSISTANT_TOKEN: "test-only-token-at-least-24-characters", PORT: "8080" },
  },
  use: { baseURL: "http://127.0.0.1:8080", headless: true, screenshot: "only-on-failure", trace: "retain-on-failure" },
});
