"use client";

// Mode-aware auth surface for the app: every consumer imports these
// components/hooks instead of an auth vendor.
//
// - betterauth: delegates to the Better Auth session
//   (`@/auth/betterAuthSession`).
// - local: token-based fallbacks from sessionStorage.
// - unset/unknown mode: everything is treated as signed-out with
//   client-side fallbacks, matching the previous keyless behavior.
//
// Keep this file dependency-free of any auth vendor.

import type { ReactNode } from "react";
import { cloneElement, isValidElement } from "react";

import { useBetterAuthSession } from "@/auth/betterAuthSession";
import { getBetterAuthToken, isBetterAuthMode } from "@/auth/betterAuth";
import { navigateToFallbackSignIn } from "@/auth/fallbackNavigation";
import { getLocalAuthToken, isLocalAuthMode } from "@/auth/localAuth";

function resolveFallbackSignInUrl(forceRedirectUrl?: string | null): string {
  if (!forceRedirectUrl) return "/sign-in";
  const params = new URLSearchParams({ redirect_url: forceRedirectUrl });
  return `/sign-in?${params.toString()}`;
}

function hasLocalAuthToken(): boolean {
  return Boolean(getLocalAuthToken());
}

export function SignedIn(props: { children: ReactNode }) {
  const betterAuth = useBetterAuthSession();
  if (isBetterAuthMode()) {
    return betterAuth.isSignedIn ? <>{props.children}</> : null;
  }
  if (isLocalAuthMode()) {
    return hasLocalAuthToken() ? <>{props.children}</> : null;
  }
  // No known mode: keep the previous keyless behavior — treat as signed out.
  return null;
}

export function SignedOut(props: { children: ReactNode }) {
  const betterAuth = useBetterAuthSession();
  if (isBetterAuthMode()) {
    return betterAuth.isSignedIn ? null : <>{props.children}</>;
  }
  if (isLocalAuthMode()) {
    return hasLocalAuthToken() ? null : <>{props.children}</>;
  }
  // No known mode: keep the previous keyless behavior — signed-out UI shows.
  return <>{props.children}</>;
}

function renderFallbackTrigger(
  children: ReactNode,
  href: string,
): React.ReactElement | null {
  if (!isValidElement(children)) {
    return null;
  }

  const child = children as React.ReactElement<{
    onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  }>;
  const existingOnClick = child.props.onClick;

  return cloneElement(child, {
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      existingOnClick?.(event);
      if (event.defaultPrevented) return;
      navigateToFallbackSignIn(href);
    },
  });
}

/**
 * Wrap a trigger element so clicking it runs `onSignOut` (which ends the
 * Better Auth session server-side and clears the cached JWT) and then reloads
 * so the sign-in gate re-appears — mirroring the local-mode sign-out flow.
 */
function renderBetterAuthSignOutTrigger(
  children: ReactNode,
  onSignOut: () => Promise<void>,
): React.ReactElement | null {
  if (!isValidElement(children)) {
    return null;
  }

  const child = children as React.ReactElement<{
    onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  }>;
  const existingOnClick = child.props.onClick;

  return cloneElement(child, {
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      existingOnClick?.(event);
      if (event.defaultPrevented) return;
      void onSignOut().then(() => window.location.reload());
    },
  });
}

/**
 * Sign-in trigger. In betterauth mode the gate already shows the Google
 * sign-in screen, so callers only need this for local mode or an unset
 * mode: it navigates to /sign-in (optionally with `forceRedirectUrl`).
 */
export function SignInButton({
  children,
  forceRedirectUrl,
}: {
  children: ReactNode;
  forceRedirectUrl?: string;
}) {
  return renderFallbackTrigger(
    children,
    resolveFallbackSignInUrl(forceRedirectUrl),
  );
}

export function SignOutButton({ children }: { children: ReactNode }) {
  const betterAuth = useBetterAuthSession();
  if (isBetterAuthMode()) {
    return renderBetterAuthSignOutTrigger(children, betterAuth.signOut);
  }
  if (isLocalAuthMode()) {
    if (typeof window !== "undefined") window.location.reload();
    return null;
  }
  return null;
}

export function useUser() {
  const betterAuth = useBetterAuthSession();
  if (isBetterAuthMode()) {
    return {
      isLoaded: betterAuth.isLoaded,
      isSignedIn: betterAuth.isSignedIn,
      user: betterAuth.user,
    } as const;
  }
  if (isLocalAuthMode()) {
    return {
      isLoaded: true,
      isSignedIn: hasLocalAuthToken(),
      user: null,
    } as const;
  }
  return { isLoaded: true, isSignedIn: false, user: null } as const;
}

export function useAuth() {
  const betterAuth = useBetterAuthSession();
  if (isBetterAuthMode()) {
    return {
      isLoaded: betterAuth.isLoaded,
      isSignedIn: betterAuth.isSignedIn,
      userId: betterAuth.isSignedIn ? (betterAuth.user?.id ?? null) : null,
      sessionId: betterAuth.sessionId,
      // Best-effort current JWT for direct fetch call sites; the Orval
      // mutator is the primary token-attach path.
      getToken: () => getBetterAuthToken(),
    } as const;
  }
  if (isLocalAuthMode()) {
    const token = getLocalAuthToken();
    return {
      isLoaded: true,
      isSignedIn: Boolean(token),
      userId: token ? "local-user" : null,
      sessionId: token ? "local-session" : null,
      getToken: async () => token,
    } as const;
  }
  return {
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    sessionId: null,
    getToken: async () => null,
  } as const;
}
