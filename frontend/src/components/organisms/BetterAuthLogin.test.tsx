import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signInWithGoogleMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth/betterAuth", () => ({
  signInWithGoogle: signInWithGoogleMock,
}));

import { BetterAuthLogin } from "./BetterAuthLogin";

describe("BetterAuthLogin", () => {
  beforeEach(() => {
    signInWithGoogleMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the Google sign-in screen", () => {
    render(<BetterAuthLogin />);
    expect(
      screen.getByRole("button", { name: /sign in with google/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sign in to Mission Control")).toBeInTheDocument();
    expect(
      screen.getByText("You must use an allowed Google Workspace account."),
    ).toBeInTheDocument();
  });

  it("starts sign-in with the redirectUrl as the OAuth callback", async () => {
    const onAuthenticatedMock = vi.fn();
    signInWithGoogleMock.mockResolvedValueOnce({ error: null, data: null });
    const user = userEvent.setup();
    render(
      <BetterAuthLogin
        redirectUrl="/boards"
        onAuthenticated={onAuthenticatedMock}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /sign in with google/i }),
    );

    await waitFor(() =>
      expect(signInWithGoogleMock).toHaveBeenCalledWith("/boards"),
    );
    expect(onAuthenticatedMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the shared sign-in redirect when no redirectUrl is given", async () => {
    const onAuthenticatedMock = vi.fn();
    signInWithGoogleMock.mockResolvedValueOnce({ error: null, data: null });
    const user = userEvent.setup();
    render(<BetterAuthLogin onAuthenticated={onAuthenticatedMock} />);

    await user.click(
      screen.getByRole("button", { name: /sign in with google/i }),
    );

    await waitFor(() =>
      expect(signInWithGoogleMock).toHaveBeenCalledWith("/onboarding"),
    );
  });

  it("honors the configured fallback redirect env when no redirectUrl is given", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL", "/boards");
    const onAuthenticatedMock = vi.fn();
    signInWithGoogleMock.mockResolvedValueOnce({ error: null, data: null });
    const user = userEvent.setup();
    render(<BetterAuthLogin onAuthenticated={onAuthenticatedMock} />);

    await user.click(
      screen.getByRole("button", { name: /sign in with google/i }),
    );

    await waitFor(() =>
      expect(signInWithGoogleMock).toHaveBeenCalledWith("/boards"),
    );
    vi.unstubAllEnvs();
  });

  it("disables the button and shows the redirecting state while in flight", async () => {
    let resolveSignIn: (value: unknown) => void = () => {};
    signInWithGoogleMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<BetterAuthLogin />);

    await user.click(
      screen.getByRole("button", { name: /sign in with google/i }),
    );

    const button = screen.getByTestId("google-sign-in-button");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Redirecting to Google...");
    expect(signInWithGoogleMock).toHaveBeenCalledTimes(1);
    // Success ends in a full-page redirect (or the default reload); the
    // gate stays frozen on purpose, so no re-enable is expected here.
    resolveSignIn({ error: null, data: null });
  });

  it("reloads the page when no onAuthenticated handler is provided", async () => {
    const reloadSpy = vi.fn();
    const originalHref = window.location.href;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...Object.getOwnPropertyNames(window.location).reduce(
          (acc, key) => {
            try {
              acc[key] = (
                window.location as unknown as Record<string, unknown>
              )[key];
            } catch {
              // non-enumerable / throwing accessor — skip
            }
            return acc;
          },
          {} as Record<string, unknown>,
        ),
        reload: reloadSpy,
        href: originalHref,
      },
    });
    signInWithGoogleMock.mockResolvedValueOnce({ error: null, data: null });
    const user = userEvent.setup();
    render(<BetterAuthLogin />);

    await user.click(
      screen.getByRole("button", { name: /sign in with google/i }),
    );

    await waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
    // restore the real jsdom location
    Object.defineProperty(window, "location", {
      configurable: true,
      value: window.location,
    });
  });

  it("shows an error and re-enables the button when sign-in fails", async () => {
    const onAuthenticatedMock = vi.fn();
    signInWithGoogleMock.mockRejectedValueOnce(new Error("oauth down"));
    const user = userEvent.setup();
    render(<BetterAuthLogin onAuthenticated={onAuthenticatedMock} />);

    await user.click(
      screen.getByRole("button", { name: /sign in with google/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("Could not start Google sign-in. Please try again."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("google-sign-in-button")).toBeEnabled();
    expect(onAuthenticatedMock).not.toHaveBeenCalled();
  });
});
