/**
 * Machine-client login through a Better Auth API key.
 *
 * The app runs in betterauth mode with a live Better Auth stack: the seeded
 * key is exchanged for a session JWT by the app itself, while the /api/v1
 * calls are intercepted so no real backend data is required. Without a key
 * (CYPRESS_BETTER_AUTH_API_KEY unset) the spec skips.
 */

const describeIfKey = Cypress.env("betterAuthApiKey")
  ? describe
  : describe.skip;

describeIfKey("Better Auth API key login", () => {
  it("user with a seeded API key passes the sign-in gate and sees the feed", () => {
    cy.intercept("GET", "**/api/v1/users/me*", {
      statusCode: 200,
      body: {
        id: "u1",
        external_auth_id: "better-auth-user",
        email: "keyuser@example.com",
        name: "Key User",
        preferred_name: "Key User",
        timezone: "UTC",
      },
    }).as("usersMe");

    cy.intercept("GET", "**/api/v1/organizations/me/list*", {
      statusCode: 200,
      body: [
        {
          id: "org1",
          name: "Testing Org",
          is_active: true,
          role: "owner",
        },
      ],
    }).as("orgsList");

    cy.intercept("GET", "**/api/v1/organizations/me/member*", {
      statusCode: 200,
      body: { organization_id: "org1", role: "owner" },
    }).as("orgMeMember");

    cy.intercept("GET", "**/api/v1/boards*", {
      statusCode: 200,
      body: {
        items: [
          { id: "b1", name: "Testing", updated_at: "2026-02-07T00:00:00Z" },
        ],
      },
    }).as("boardsList");

    cy.intercept("GET", "**/api/v1/boards/b1/snapshot*", {
      statusCode: 200,
      body: { tasks: [], agents: [], approvals: [], chat_messages: [] },
    }).as("boardSnapshot");

    cy.loginWithBetterAuthApiKey();
    cy.visit("/activity");
    cy.waitForAppLoaded();
    cy.contains(/live feed/i).should("be.visible");
    cy.get('[data-testid="google-sign-in-button"]').should("not.exist");
  });
});
