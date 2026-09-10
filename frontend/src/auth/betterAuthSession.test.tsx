import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";

const fetchBetterAuthSessionMock = vi.hoisted(() => vi.fn());
const signOutBetterAuthMock = vi.hoisted(() => vi.fn());
const isBetterAuthModeMock = vi.hoisted(() => vi.fn(() => false));

vi.mock("@/auth/betterAuth", () => ({
  fetchBetterAuthSession: fetchBetterAuthSessionMock,
  signOutBetterAuth: signOutBetterAuthMock,
  isBetterAuthMode: isBetterAuthModeMock,
}));

import {
  BetterAuthSessionProvider,
  useBetterAuthSession,
} from "@/auth/betterAuthSession";

function Probe() {
  const state = useBetterAuthSession();
  return (
    <div>
      <span data-testid="loaded">{String(state.isLoaded)}</span>
      <span data-testid="signedIn">{String(state.isSignedIn)}</span>
      <span data-testid="name">{state.user?.fullName ?? ""}</span>
      <span data-testid="first">{state.user?.firstName ?? ""}</span>
      <span data-testid="avatar">{state.user?.imageUrl ?? ""}</span>
      <span data-testid="email">
        {state.user?.primaryEmailAddress?.emailAddress ?? ""}
      </span>
      <span data-testid="session">{state.sessionId ?? ""}</span>
      <button
        type="button"
        onClick={() => {
          void state.signOut();
        }}
      >
        sign out
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <BetterAuthSessionProvider>
      <Probe />
    </BetterAuthSessionProvider>,
  );
}

describe("betterAuthSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchBetterAuthSessionMock.mockReset();
    signOutBetterAuthMock.mockReset();
    isBetterAuthModeMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports signed-out and keeps sign-out a no-op outside betterauth mode", async () => {
    isBetterAuthModeMock.mockReturnValue(false);
    const user = await import("@testing-library/user-event");
    renderProbe();

    expect(screen.getByTestId("loaded")).toHaveTextContent("true");
    expect(screen.getByTestId("signedIn")).toHaveTextContent("false");
    expect(screen.getByTestId("name")).toHaveTextContent("");
    await user.default.click(screen.getByRole("button", { name: "sign out" }));
    await waitFor(() => expect(signOutBetterAuthMock).not.toHaveBeenCalled());
    expect(screen.getByTestId("signedIn")).toHaveTextContent("false");
  });

  it("keeps sign-out a no-op when no provider is mounted", async () => {
    isBetterAuthModeMock.mockReturnValue(false);
    let signOutFn: () => Promise<void> = () => Promise.resolve();
    function BareProbe() {
      const state = useBetterAuthSession();
      useEffect(() => {
        signOutFn = state.signOut;
      });
      return <span data-testid="signed">{String(state.isSignedIn)}</span>;
    }
    render(<BareProbe />);

    expect(screen.getByTestId("signed")).toHaveTextContent("false");
    await signOutFn();
    expect(signOutBetterAuthMock).not.toHaveBeenCalled();
  });

  it("shows the session once loaded (mapped display fields)", async () => {
    isBetterAuthModeMock.mockReturnValue(true);
    fetchBetterAuthSessionMock.mockResolvedValueOnce({
      user: {
        id: "u1",
        email: "ada@example.com",
        name: "Ada Lovelace",
        image: "https://img.example/ada.png",
      },
      session: { id: "s1" },
    });
    renderProbe();

    await screen
      .findByTestId("signedIn")
      .then((el) => waitFor(() => expect(el).toHaveTextContent("true")));
    expect(screen.getByTestId("name")).toHaveTextContent("Ada Lovelace");
    expect(screen.getByTestId("first")).toHaveTextContent("Ada");
    expect(screen.getByTestId("avatar")).toHaveTextContent(
      "https://img.example/ada.png",
    );
    expect(screen.getByTestId("email")).toHaveTextContent("ada@example.com");
    expect(screen.getByTestId("session")).toHaveTextContent("s1");
  });

  it("maps users without a display name or email", async () => {
    isBetterAuthModeMock.mockReturnValue(true);
    fetchBetterAuthSessionMock.mockResolvedValueOnce({
      user: {
        id: "u2",
        email: "",
        name: "   ",
        image: null,
      },
      session: { id: "s2" },
    });
    renderProbe();

    await waitFor(() =>
      expect(screen.getByTestId("signedIn")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("name")).toHaveTextContent("");
    expect(screen.getByTestId("first")).toHaveTextContent("");
    expect(screen.getByTestId("avatar")).toHaveTextContent("");
    expect(screen.getByTestId("email")).toHaveTextContent("");
  });

  it("stays signed out when there is no session", async () => {
    isBetterAuthModeMock.mockReturnValue(true);
    fetchBetterAuthSessionMock.mockResolvedValueOnce(null);
    renderProbe();

    await waitFor(() =>
      expect(screen.getByTestId("loaded")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("signedIn")).toHaveTextContent("false");
  });

  it("sign-out clears the local session state and calls signOutBetterAuth", async () => {
    isBetterAuthModeMock.mockReturnValue(true);
    signOutBetterAuthMock.mockResolvedValueOnce(undefined);
    fetchBetterAuthSessionMock
      .mockResolvedValueOnce({
        user: {
          id: "u1",
          email: "ada@example.com",
          name: "Ada Lovelace",
        },
        session: { id: "s1" },
      })
      .mockResolvedValueOnce(null);
    const user = await import("@testing-library/user-event");
    renderProbe();

    await waitFor(() =>
      expect(screen.getByTestId("signedIn")).toHaveTextContent("true"),
    );
    await user.default.click(screen.getByRole("button", { name: "sign out" }));

    expect(signOutBetterAuthMock).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByTestId("signedIn")).toHaveTextContent("false"),
    );
  });

  it("ignores a session load that resolves after unmount", async () => {
    isBetterAuthModeMock.mockReturnValue(true);
    let resolveFetch: (value: unknown) => void = () => {};
    fetchBetterAuthSessionMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const { unmount } = renderProbe();
    unmount();

    // Resolves after the provider is gone: must be a no-op, not a crash.
    resolveFetch({
      user: { id: "u9", email: "late@example.com", name: "Late" },
      session: { id: "s9" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId("signedIn")).toBeNull();
  });
});
