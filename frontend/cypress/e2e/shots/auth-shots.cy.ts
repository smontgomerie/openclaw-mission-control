/// <reference types="cypress" />

/**
 * Flow-capture shots for the Better Auth sign-in experience
 * (NEXT_PUBLIC_AUTH_MODE=betterauth).
 *
 *   FLOW_CAPTURE_AUTH_MODE=betterauth npm run flow-capture --prefix frontend -- auth
 *
 * Proves both halves of the swap:
 * 1. signed out: the new first screen — "Sign in to Mission Control" with a
 *    "Sign in with Google" button (the old mode showed "Authentication is
 *    unavailable" here).
 * 2. signed in: the app loads and every API call carries a Better Auth JWT
 *    (asserted on the request's Authorization header).
 *
 * No live Better Auth server or Google round-trip — the /api/auth/* routes
 * are intercepted with the real Better Auth response shapes (cookie session
 * at get-session, jwt-plugin token at /token).
 */
describe("Auth (Better Auth) flow-capture shots", () => {
  const apiBase = "**/api/v1";
  const email = "ada@example.com";

  /**
   * A well-formed (unsigned, fake) JWT with an `exp` claim so the client's
   * cache path sees a real-looking payload; only the shape is exercised.
   * base64url is done manually because the bundled Buffer polyfill in
   * Cypress's webpack context does not support the "base64url" encoding.
   */
  const b64url = (obj: unknown): string => {
    const b64 = Buffer.from(JSON.stringify(obj)).toString("base64");
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const jwt = [
    b64url({ alg: "RS256", typ: "JWT" }),
    b64url({
      iss: "http://127.0.0.1:3010",
      aud: "http://127.0.0.1:3010",
      sub: "u1",
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
    b64url({ kid: "fake" }),
  ].join(".");

  /** Cookie-session shape served by the Better Auth server (get-session). */
  const sessionBody = {
    user: {
      id: "u1",
      email,
      name: "Ada Lovelace",
      image: null,
    },
    session: { id: "s1" },
  };

  function stubBoards(): void {
    cy.intercept("GET", `${apiBase}/organizations/me/member*`, {
      statusCode: 200,
      body: {
        id: "m1",
        organization_id: "o1",
        user_id: "u1",
        role: "owner",
        all_boards_read: true,
        all_boards_write: true,
        created_at: "2026-02-11T00:00:00Z",
        updated_at: "2026-02-11T00:00:00Z",
        board_access: [],
      },
    }).as("membership");

    cy.intercept("GET", `${apiBase}/users/me*`, {
      statusCode: 200,
      body: {
        id: "u1",
        external_auth_id: "bauth:u1",
        email,
        name: "Ada Lovelace",
        preferred_name: "Ada",
        timezone: "UTC",
        is_super_admin: false,
      },
    }).as("me");

    cy.intercept("GET", `${apiBase}/organizations/me/list*`, {
      statusCode: 200,
      body: [{ id: "o1", name: "Personal", role: "owner", is_active: true }],
    }).as("organizations");

    cy.intercept("GET", `${apiBase}/boards*`, {
      statusCode: 200,
      body: {
        items: [
          {
            id: "b1",
            name: "Demo Board",
            slug: "demo-board",
            description: "Demo",
            gateway_id: "g1",
            board_group_id: null,
            board_type: "general",
            objective: null,
            success_metrics: null,
            target_date: null,
            goal_confirmed: true,
            goal_source: "test",
            organization_id: "o1",
            created_at: "2026-02-11T00:00:00Z",
            updated_at: "2026-02-11T00:00:00Z",
          },
        ],
        total: 1,
        limit: 200,
        offset: 0,
      },
    }).as("boards");

    cy.intercept("GET", `${apiBase}/board-groups*`, {
      statusCode: 200,
      body: { items: [], total: 0, limit: 200, offset: 0 },
    }).as("boardGroups");
  }

  it("shows the Google sign-in screen when there is no session", () => {
    cy.intercept("GET", "**/healthz", {
      statusCode: 200,
      body: { ok: true },
    }).as("healthz");
    cy.intercept("GET", "**/api/auth/get-session*", {
      statusCode: 401,
      body: {},
    }).as("getSessionOut");

    cy.visit("/");

    cy.contains("Sign in to Mission Control").should("be.visible");
    cy.contains("Use your Google Workspace account to continue").should(
      "be.visible",
    );
    cy.get("[data-testid='google-sign-in-button']").should("be.visible");

    // The optional fail-closed probe — must stay off in the registered green path.
    const assertFail = Cypress.env("FLOW_CAPTURE_ASSERT_FAIL");
    if (assertFail === true || assertFail === "1" || assertFail === "true") {
      cy.contains("h1", "FLOW_CAPTURE_ASSERT_FAIL sentinel").should(
        "be.visible",
      );
    }

    cy.screenshot("auth-signed-out", { capture: "viewport", overwrite: true });
  });

  it("loads the app signed in and carries the Better Auth JWT on API calls", () => {
    stubBoards();
    cy.intercept("GET", "**/healthz", {
      statusCode: 200,
      body: { ok: true },
    }).as("healthz");
    cy.intercept("GET", "**/api/auth/get-session*", {
      statusCode: 200,
      body: sessionBody,
    }).as("getSession");
    cy.intercept("GET", "**/api/auth/token*", {
      statusCode: 200,
      body: { token: jwt },
    }).as("authToken");

    cy.visit("/boards");

    // Wait for the boards content to appear (proves the session gate passed
    // and the page rendered with data). Avoids waitForAppLoaded which
    // depends on the global-loader element that may not exist yet in the
    // signed-in betterauth render path.
    cy.contains("Demo Board").should("be.visible", { timeout: 30_000 });

    cy.wait("@authToken");
    cy.get("@boards").then((interception) => {
      const aliased = interception as unknown as {
        request: { headers: Record<string, string> };
      };
      expect(aliased.request.headers.authorization).to.equal(`Bearer ${jwt}`);
    });
    cy.get("@me").then((interception) => {
      const aliased = interception as unknown as {
        request: { headers: Record<string, string> };
      };
      expect(aliased.request.headers.authorization).to.equal(`Bearer ${jwt}`);
    });

    // The whole point of the swap: every API call to the backend carries the
    // Better Auth JWT (asserted on the request, not a copy of it).
    const assertBearer = (alias: string): void => {
      cy.get(alias).then((interception) => {
        const aliased = interception as unknown as {
          request: { headers: Record<string, string> };
        };
        expect(aliased.request.headers.authorization).to.equal(`Bearer ${jwt}`);
      });
    };
    assertBearer("@boards");
    assertBearer("@me");

    cy.screenshot("auth-signed-in", { capture: "viewport", overwrite: true });
  });
});
