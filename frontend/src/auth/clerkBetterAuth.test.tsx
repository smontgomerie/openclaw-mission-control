import { useEffect } from "react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  SignedIn,
  SignedOut,
  SignOutButton,
  isClerkEnabled,
  useAuth,
  useUser,
} from "@/auth/clerk";

vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  SignedIn: ({ children }: { children: ReactNode }) => children,
  SignedOut: ({ children }: { children: ReactNode }) => children,
  SignInButton: ({ children }: { children: ReactNode }) => children,
  SignOutButton: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
}));

const useBetterAuthSessionMock = vi.hoisted(() => vi.fn());
const isBetterAuthModeMock = vi.hoisted(() => vi.fn());
const getBetterAuthTokenMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth/betterAuthSession", () => ({
  useBetterAuthSession: useBetterAuthSessionMock,
  BetterAuthSessionProvider: ({ children }: { children: ReactNode }) =>
    children,
}));
vi.mock("@/auth/betterAuth", () => ({
  isBetterAuthMode: isBetterAuthModeMock,
  getBetterAuthToken: getBetterAuthTokenMock,
}));

const signedInState = {
  isLoaded: true,
  isSignedIn: true,
  user: {
    id: "u1",
    email: "ada@example.com",
    name: "Ada Lovelace",
    image: null,
    fullName: "Ada Lovelace",
    firstName: "Ada",
    username: "ada@example.com",
    imageUrl: null,
    primaryEmailAddress: { emailAddress: "ada@example.com" },
  },
  sessionId: "s1",
  signOut: vi.fn(async () => {}),
};

const signedOutState = {
  isLoaded: true,
  isSignedIn: false,
  user: null,
  sessionId: null,
  signOut: vi.fn(async () => {}),
};

describe("clerk shims in betterauth mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isBetterAuthModeMock.mockReturnValue(true);
    getBetterAuthTokenMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("isClerkEnabled is false in betterauth mode even with a valid key", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "betterauth");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_real_key_123");
    expect(isClerkEnabled()).toBe(false);
  });

  it("SignedIn renders children only when the session is signed in", () => {
    useBetterAuthSessionMock.mockReturnValue(signedInState);
    const first = render(
      <SignedIn>
        <span>inside</span>
      </SignedIn>,
    );
    expect(screen.getByText("inside")).toBeInTheDocument();
    first.unmount();

    useBetterAuthSessionMock.mockReturnValue(signedOutState);
    const second = render(
      <SignedIn>
        <span>inside</span>
      </SignedIn>,
    );
    expect(screen.queryByText("inside")).toBeNull();
    second.unmount();
  });

  it("SignedOut renders children only when the session is signed out", () => {
    useBetterAuthSessionMock.mockReturnValue(signedOutState);
    const first = render(
      <SignedOut>
        <span>outside</span>
      </SignedOut>,
    );
    expect(screen.getByText("outside")).toBeInTheDocument();
    first.unmount();

    useBetterAuthSessionMock.mockReturnValue(signedInState);
    const second = render(
      <SignedOut>
        <span>outside</span>
      </SignedOut>,
    );
    expect(screen.queryByText("outside")).toBeNull();
    second.unmount();
  });

  it("useUser exposes the mapped Better Auth user", () => {
    useBetterAuthSessionMock.mockReturnValue(signedInState);
    function Probe() {
      const { isSignedIn, user } = useUser();
      return (
        <div>
          <span data-testid="signed">{String(isSignedIn)}</span>
          <span data-testid="name">{user?.fullName ?? ""}</span>
          <span data-testid="email">
            {user?.primaryEmailAddress?.emailAddress ?? ""}
          </span>
        </div>
      );
    }
    render(<Probe />);
    expect(screen.getByTestId("signed")).toHaveTextContent("true");
    expect(screen.getByTestId("name")).toHaveTextContent("Ada Lovelace");
    expect(screen.getByTestId("email")).toHaveTextContent("ada@example.com");
  });

  it("useAuth reports session state and fetches the current JWT", async () => {
    useBetterAuthSessionMock.mockReturnValue(signedInState);
    getBetterAuthTokenMock.mockResolvedValueOnce("jwt-123");
    let probe: { getToken?: () => Promise<string | null> } | null = null;
    function Probe() {
      const auth = useAuth();
      useEffect(() => {
        probe = { getToken: auth.getToken };
      });
      return (
        <div>
          <span data-testid="signed">{String(auth.isSignedIn)}</span>
          <span data-testid="userId">{auth.userId ?? ""}</span>
          <span data-testid="sessionId">{auth.sessionId ?? ""}</span>
        </div>
      );
    }
    render(<Probe />);
    expect(screen.getByTestId("signed")).toHaveTextContent("true");
    expect(screen.getByTestId("userId")).toHaveTextContent("u1");
    expect(screen.getByTestId("sessionId")).toHaveTextContent("s1");
    expect(await probe!.getToken?.()).toBe("jwt-123");
  });

  it("SignOutButton ends the session and reloads", async () => {
    useBetterAuthSessionMock.mockReturnValue(signedInState);
    const reloadSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...Object.getOwnPropertyDescriptor(window.location, "href")?.value,
        reload: reloadSpy,
      },
    });
    render(
      <SignOutButton>
        <button type="button">Sign out</button>
      </SignOutButton>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(signedInState.signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });
});
