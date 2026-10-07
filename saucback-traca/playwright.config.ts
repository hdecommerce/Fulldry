import { defineConfig } from "@playwright/test";

const MOCK = "http://127.0.0.1:4010";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1024, height: 1366 },
    // PW_CHROME : chemin d'un Chromium déjà installé (facultatif)
    launchOptions: process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {},
  },
  webServer: [
    { command: "node e2e/mock-server.mjs", url: `${MOCK}/__state`, reuseExistingServer: true },
    {
      command: "npx next start -p 3100",
      url: "http://127.0.0.1:3100/",
      reuseExistingServer: true,
      env: {
        ANTHROPIC_API_KEY: "sk-ant-test", ANTHROPIC_BASE_URL: MOCK,
        SHOPIFY_STORE_DOMAIN: "test.myshopify.com", SHOPIFY_BASE_URL: MOCK, SHOPIFY_ADMIN_TOKEN: "shpat_test",
        APP_PIN: "123456", SESSION_SECRET: "secret-de-test-tres-long-0123456789",
      },
    },
  ],
});
