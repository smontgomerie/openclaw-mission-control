import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

import SignInPage from "./page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe("/sign-in", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows the local token screen in local mode", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "local");

    render(<SignInPage />);

    expect(
      screen.getByRole("heading", { name: /local authentication/i }),
    ).toBeInTheDocument();
  });

  it("shows the Google sign-in screen in betterauth mode", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "betterauth");

    render(<SignInPage />);

    expect(
      screen.getByRole("button", { name: /sign in with google/i }),
    ).toBeInTheDocument();
  });

  it("explains the missing configuration when no auth mode is set", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "");

    render(<SignInPage />);

    expect(
      screen.getByRole("heading", { name: /authentication is unavailable/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/NEXT_PUBLIC_AUTH_MODE=betterauth/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/NEXT_PUBLIC_AUTH_MODE=local/i),
    ).toBeInTheDocument();
  });
});
