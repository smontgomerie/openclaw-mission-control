import { afterEach, describe, expect, it, vi } from "vitest";

import {
  currentSignInRedirectUrl,
  resolveSignInRedirectUrl,
} from "@/auth/redirects";

describe("resolveSignInRedirectUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses env fallback when redirect is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SIGN_IN_FALLBACK_REDIRECT_URL", "/boards");

    expect(resolveSignInRedirectUrl(null)).toBe("/boards");
  });

  it("defaults to /onboarding when no env fallback is set", () => {
    expect(resolveSignInRedirectUrl(null)).toBe("/onboarding");
  });

  it("treats /sign-in as empty and uses the fallback", () => {
    expect(resolveSignInRedirectUrl("/sign-in")).toBe("/onboarding");
    expect(resolveSignInRedirectUrl("/sign-in?redirect_url=%2Fboards")).toBe(
      "/onboarding",
    );
  });

  it("allows safe relative paths", () => {
    expect(resolveSignInRedirectUrl("/dashboard?tab=ops#queue")).toBe(
      "/dashboard?tab=ops#queue",
    );
  });

  it("rejects protocol-relative urls", () => {
    vi.stubEnv("NEXT_PUBLIC_SIGN_IN_FALLBACK_REDIRECT_URL", "/activity");

    expect(resolveSignInRedirectUrl("//evil.example.com/path")).toBe(
      "/activity",
    );
  });

  it("rejects external absolute urls", () => {
    vi.stubEnv("NEXT_PUBLIC_SIGN_IN_FALLBACK_REDIRECT_URL", "/activity");

    expect(resolveSignInRedirectUrl("https://evil.example.com/steal")).toBe(
      "/activity",
    );
  });

  it("accepts same-origin absolute urls and normalizes to path", () => {
    const url = `${window.location.origin}/boards/new?src=invite#top`;
    expect(resolveSignInRedirectUrl(url)).toBe("/boards/new?src=invite#top");
  });
});

describe("currentSignInRedirectUrl", () => {
  it("prefers an explicit redirect_url param over the current page", () => {
    expect(
      currentSignInRedirectUrl("/sign-in", "?redirect_url=%2Fboards"),
    ).toBe("/boards");
  });

  it("falls back to the current page when no param is present", () => {
    expect(currentSignInRedirectUrl("/boards", "?tab=ops")).toBe(
      "/boards?tab=ops",
    );
    expect(currentSignInRedirectUrl("/boards", "")).toBe("/boards");
  });

  it("ignores an empty redirect_url param and keeps the current page", () => {
    expect(currentSignInRedirectUrl("/sign-in", "?redirect_url=")).toBe(
      "/sign-in?redirect_url=",
    );
  });
});

describe("betterAuthCanonicalContinueUrl", () => {
  it("returns null when already on the canonical origin", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_BETTER_AUTH_BASE_URL",
      "https://mc.example.com:8443",
    );
    const { betterAuthCanonicalContinueUrl } = await import("@/auth/redirects");
    expect(
      betterAuthCanonicalContinueUrl(
        "https://mc.example.com:8443/sign-in",
        "https://mc.example.com:8443",
      ),
    ).toBeNull();
  });

  it("rewrites other origins onto the canonical host", async () => {
    const { betterAuthCanonicalContinueUrl } = await import("@/auth/redirects");
    expect(
      betterAuthCanonicalContinueUrl(
        "http://localhost:3100/boards?x=1",
        "https://mc.example.com:8443",
      ),
    ).toBe("https://mc.example.com:8443/boards?x=1");
  });
});

describe("describeAuthQueryError", () => {
  it("maps known oauth failure codes", async () => {
    const { describeAuthQueryError } = await import("@/auth/redirects");
    expect(describeAuthQueryError(null)).toBeNull();
    expect(describeAuthQueryError("UNKNOWN")).toMatch(/OAuth state/i);
    expect(describeAuthQueryError("state_not_found")).toMatch(/different URL/i);
  });
});
