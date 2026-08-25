import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    specPattern: "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",
    // Flow-capture shots are run via npm run flow-capture (own config + zero retries).
    excludeSpecPattern: "cypress/e2e/shots/**",
    supportFile: "cypress/support/e2e.ts",
    defaultCommandTimeout: 20_000,
    retries: {
      runMode: 2,
      openMode: 0,
    },
  },
});
