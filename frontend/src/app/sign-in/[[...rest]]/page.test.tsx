import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

import SignInPage from "./page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@clerk/nextjs", () => ({
  SignIn: () => <div>Clerk sign-in</div>,
}));

describe("/sign-in", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows a configuration message when Clerk mode is enabled without a valid key", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "clerk");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "placeholder");

    render(<SignInPage />);

    expect(
      screen.getByRole("heading", { name: "Authentication is unavailable" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no valid clerk publishable key is configured/i),
    ).toBeInTheDocument();
  });
});
