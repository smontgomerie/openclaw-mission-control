// Cypress support file.
// Place global hooks/commands here.

/// <reference types="cypress" />

import { addClerkCommands } from "@clerk/testing/cypress";

// Clerk/Next.js occasionally throws a non-deterministic hydration mismatch
// on /sign-in. Ignore this known UI noise so E2E assertions can proceed.
Cypress.on("uncaught:exception", (err) => {
  if (
    err?.message?.includes("Hydration failed") ||
    err?.message?.includes("Minified React error #418")
  ) {
    return false;
  }
  return true;
});

addClerkCommands({ Cypress, cy });

import "./commands";
