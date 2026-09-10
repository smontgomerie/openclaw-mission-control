"use client";

// React session state for Better Auth mode: loads the cookie session from
// `/api/auth/get-session` on mount and exposes sign-out. Consumed by
// `AuthProvider` (the signed-in gate) and the `@/auth/session` shims
// (SignedIn/SignedOut/useUser/useAuth), which delegate to it in betterauth
// mode so the rest of the app stays mode-agnostic.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  fetchBetterAuthSession,
  isBetterAuthMode,
  signOutBetterAuth,
  type BetterAuthSessionData,
} from "@/auth/betterAuth";

/**
 * Better Auth's user, adapted to the display fields the app's UI reads
 * (the legacy `fullName`, `firstName`, `username`, `imageUrl`,
 * `primaryEmailAddress` shape). `useUser()` in `@/auth/session` exposes this
 * shape in betterauth mode, so app pages stay mode-agnostic.
 */
export interface BetterAuthAppUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  fullName: string | null;
  firstName: string | null;
  username: string | null;
  imageUrl: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
}

function toAppUser(
  user: BetterAuthSessionData["user"] | null | undefined,
): BetterAuthAppUser | null {
  if (!user) {
    return null;
  }
  const name = user.name?.trim() ? user.name : null;
  return {
    id: user.id,
    email: user.email,
    name,
    image: user.image ?? null,
    fullName: name,
    firstName: name ? name.split(" ")[0] : null,
    username: user.email,
    imageUrl: user.image ?? null,
    primaryEmailAddress: user.email ? { emailAddress: user.email } : null,
  };
}

export interface BetterAuthSessionState {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: BetterAuthAppUser | null;
  sessionId: string | null;
  signOut: () => Promise<void>;
}

const SIGNED_OUT: BetterAuthSessionState = {
  isLoaded: true,
  isSignedIn: false,
  user: null,
  sessionId: null,
  signOut: async () => undefined,
};

const BetterAuthSessionContext =
  createContext<BetterAuthSessionState>(SIGNED_OUT);

export function BetterAuthSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const betterAuthMode = isBetterAuthMode();
  const [session, setSession] = useState<BetterAuthSessionData | null>(null);
  const [isLoaded, setIsLoaded] = useState(!betterAuthMode);

  useEffect(() => {
    if (!betterAuthMode) {
      return;
    }
    let cancelled = false;
    fetchBetterAuthSession().then((loaded) => {
      if (cancelled) {
        return;
      }
      setSession(loaded);
      setIsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [betterAuthMode]);

  const signOut = useCallback(async () => {
    if (!betterAuthMode) {
      return;
    }
    await signOutBetterAuth();
    setSession(null);
  }, [betterAuthMode]);

  const value = useMemo(
    () => ({
      isLoaded,
      isSignedIn: Boolean(session),
      user: toAppUser(session?.user),
      sessionId: session?.session?.id ?? null,
      signOut,
    }),
    [isLoaded, session, signOut],
  );

  return (
    <BetterAuthSessionContext.Provider value={value}>
      {children}
    </BetterAuthSessionContext.Provider>
  );
}

export function useBetterAuthSession(): BetterAuthSessionState {
  // No provider mounted (e.g. the `@/auth/session` shims in local mode)
  // falls back to the signed-out default; a mounted provider always reports
  // its real state, so consumers stay mode-agnostic.
  return useContext(BetterAuthSessionContext);
}
