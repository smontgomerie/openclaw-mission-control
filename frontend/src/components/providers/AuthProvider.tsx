"use client";

import { useEffect, type ReactNode } from "react";

import {
  BetterAuthSessionProvider,
  useBetterAuthSession,
} from "@/auth/betterAuthSession";
import {
  clearLocalAuthToken,
  getLocalAuthToken,
  isLocalAuthMode,
} from "@/auth/localAuth";
import { isBetterAuthMode } from "@/auth/betterAuth";
import { currentSignInRedirectUrl } from "@/auth/redirects";
import { BetterAuthLogin } from "@/components/organisms/BetterAuthLogin";
import { LocalAuthLogin } from "@/components/organisms/LocalAuthLogin";

/**
 * Better Auth mode: the whole app sits behind a session gate. While the
 * session check is pending nothing renders (no unauthenticated API storm);
 * signed in -> the app; signed out -> the Google sign-in screen.
 */
function BetterAuthGate({ children }: { children: ReactNode }) {
  // Sign-out (via the shared session context) flips `isSignedIn` back to
  // false and re-shows the gate — the session cookie and cached JWT are
  // already cleared by `signOutBetterAuth()`.
  const { isLoaded, isSignedIn } = useBetterAuthSession();

  if (!isLoaded) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-app"
        role="status"
        aria-label="Loading your session"
      >
        <span className="text-sm text-muted">Loading…</span>
      </div>
    );
  }

  if (isSignedIn) {
    return <>{children}</>;
  }

  // Keep the user on the page they were on when they signed out (local
  // mode just reloads that URL), instead of the /onboarding fallback.
  // An explicit ?redirect_url= param (e.g. /sign-in?redirect_url=/boards)
  // wins; the value is validated in BetterAuthLogin via
  // resolveSignInRedirectUrl (including treating /sign-in itself as empty).
  const redirectUrl =
    typeof window === "undefined"
      ? null
      : currentSignInRedirectUrl(
          window.location.pathname,
          window.location.search,
        );

  return <BetterAuthLogin redirectUrl={redirectUrl} />;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const localMode = isLocalAuthMode();
  const betterAuthMode = isBetterAuthMode();

  useEffect(() => {
    if (!localMode) {
      clearLocalAuthToken();
    }
  }, [localMode]);

  if (betterAuthMode) {
    return (
      <BetterAuthSessionProvider>
        <BetterAuthGate>{children}</BetterAuthGate>
      </BetterAuthSessionProvider>
    );
  }

  if (localMode) {
    if (!getLocalAuthToken()) {
      return <LocalAuthLogin />;
    }
    return <>{children}</>;
  }

  // No auth mode configured: render the app with the client-side
  // signed-out fallbacks (see `@/auth/session`).
  return <>{children}</>;
}
