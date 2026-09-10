import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    specPattern: "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",
    // Flow-capture shots are run via npm run flow-capture (own config + zero retries).
    excludeSpecPattern: "cypress/e2e/shots/**",
    env: {
      // Better Auth API key for machine-client specs (mc_...); set it to
      // CYPRESS_BETTER_AUTH_API_KEY=mc_... and betterauth_api_key.cy.ts runs.
      // Unset, the spec skips.
      betterAuthApiKey: process.env.CYPRESS_BETTER_AUTH_API_KEY,
    },
    supportFile: "cypress/support/e2e.ts",
    defaultCommandTimeout: 20_000,
    retries: {
      runMode: 2,
      openMode: 0,
    },
  },
});
