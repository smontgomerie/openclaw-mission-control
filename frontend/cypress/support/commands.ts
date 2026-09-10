/// <reference types="cypress" />

const APP_LOAD_TIMEOUT_MS = 30_000;
const LOCAL_AUTH_STORAGE_KEY = "mc_local_auth_token";
// Must match API_KEY_STORAGE_KEY in src/auth/betterAuth.ts — the app reads
// the seeded key from sessionStorage and exchanges it for its session JWT.
const BETTER_AUTH_API_KEY_STORAGE_KEY = "mc_api_key";
const DEFAULT_LOCAL_AUTH_TOKEN =
  "cypress-local-auth-token-0123456789-0123456789-0123456789x";

Cypress.Commands.add("waitForAppLoaded", () => {
  cy.get("[data-cy='route-loader']", {
    timeout: APP_LOAD_TIMEOUT_MS,
  }).should("not.exist");

  cy.get("[data-cy='global-loader']", {
    timeout: APP_LOAD_TIMEOUT_MS,
  }).should("have.attr", "aria-hidden", "true");
});

Cypress.Commands.add("loginWithLocalAuth", (token = DEFAULT_LOCAL_AUTH_TOKEN) => {
  cy.visit("/", {
    onBeforeLoad(win) {
      win.sessionStorage.setItem(LOCAL_AUTH_STORAGE_KEY, token);
    },
  });
});

Cypress.Commands.add("logoutLocalAuth", () => {
  cy.visit("/", {
    onBeforeLoad(win) {
      win.sessionStorage.removeItem(LOCAL_AUTH_STORAGE_KEY);
    },
  });
});

/**
 * Log in a non-interactive (machine) client with a Better Auth API key.
 *
 * Validates the key against the app's Better Auth origin (same origin the app
 * itself exchanges it at), then seeds it in sessionStorage so the app's token
 * source exchanges it for a session JWT — no cookie, no Google consent.
 */
Cypress.Commands.add("loginWithBetterAuthApiKey", (
  apiKey: string = Cypress.env("betterAuthApiKey") as string,
) => {
  cy.request({
    url: "/api/auth/get-session",
    headers: { "x-api-key": apiKey },
  }).then((resp) => {
    expect(resp.status).to.eq(200);
    expect(resp.body?.user?.id).to.be.a("string");
  });
  cy.visit("/", {
    onBeforeLoad(win) {
      win.sessionStorage.setItem(BETTER_AUTH_API_KEY_STORAGE_KEY, apiKey);
    },
  });
});

Cypress.Commands.add("logoutWithBetterAuthApiKey", () => {
  cy.visit("/", {
    onBeforeLoad(win) {
      win.sessionStorage.removeItem(BETTER_AUTH_API_KEY_STORAGE_KEY);
    },
  });
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * Waits for route-level and global app loaders to disappear.
       */
      waitForAppLoaded(): Chainable<void>;

      /**
       * Seeds session storage with a local auth token for local-auth mode.
       */
      loginWithLocalAuth(token?: string): Chainable<void>;

      /**
       * Clears local auth token from session storage.
       */
      logoutLocalAuth(): Chainable<void>;

      /**
       * Validates a Better Auth API key against the app origin, then seeds it
       * in sessionStorage so the app exchanges it for a session JWT.
       */
      loginWithBetterAuthApiKey(apiKey?: string): Chainable<void>;

      /**
       * Clears the seeded Better Auth API key from session storage.
       */
      logoutWithBetterAuthApiKey(): Chainable<void>;
    }
  }
}

export {};
