import type { ReactNode } from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { SignInButton } from "./clerk";

vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  SignedIn: ({ children }: { children: ReactNode }) => children,
  SignedOut: ({ children }: { children: ReactNode }) => children,
  SignInButton: ({ children }: { children: ReactNode }) => children,
  SignOutButton: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
}));

const navigateToFallbackSignInMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth/fallbackNavigation", () => ({
  navigateToFallbackSignIn: navigateToFallbackSignInMock,
}));

describe("SignInButton fallback", () => {
  afterEach(() => {
    navigateToFallbackSignInMock.mockReset();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("redirects to the dedicated sign-in page when Clerk is unavailable", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "clerk");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "placeholder");

    render(
      <SignInButton forceRedirectUrl="/boards/abc/edit">
        <button type="button">Sign in</button>
      </SignInButton>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(navigateToFallbackSignInMock).toHaveBeenCalledWith(
      "/sign-in?redirect_url=%2Fboards%2Fabc%2Fedit",
    );
  });
});
