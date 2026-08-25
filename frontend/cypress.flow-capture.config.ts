import { defineConfig } from "cypress";

/**
 * Flow-capture runs assert once and exit — do not inherit e2e runMode retries.
 */
export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    specPattern: "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",
    supportFile: "cypress/support/e2e.ts",
    defaultCommandTimeout: 20_000,
    retries: {
      runMode: 0,
      openMode: 0,
    },
  },
});
