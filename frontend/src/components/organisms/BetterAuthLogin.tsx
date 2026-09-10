"use client";

import { useState } from "react";

import { signInWithGoogle } from "@/auth/betterAuth";
import { resolveSignInRedirectUrl } from "@/auth/redirects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45c-.28 1.5-1.12 2.78-2.39 3.62v3h3.87c2.27-2.14 3.57-5.27 3.57-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3c-1.08.73-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.71H1.29C.48 8.23 0 10.06 0 12s.48 3.77 1.29 5.29l3.98-3z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.34.6 4.58 1.8l3.48-3.48C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.71l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

type BetterAuthLoginProps = {
  /**
   * Where the user lands after the OAuth round-trip (Better Auth's final
   * redirect target). Defaults to the current location, which is what the
   * full-screen sign-in gate wants.
   */
  redirectUrl?: string | null;
  onAuthenticated?: () => void;
};

const defaultOnAuthenticated = () => window.location.reload();

/**
 * "Sign in with Google" screen for `NEXT_PUBLIC_AUTH_MODE=betterauth`.
 * Better Auth runs Google OAuth in this app (`/api/auth/*`); after the
 * round-trip the session cookie is set and the gate re-evaluates.
 */
export function BetterAuthLogin({
  redirectUrl,
  onAuthenticated,
}: BetterAuthLoginProps) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setIsRedirecting(true);
    setError(null);
    try {
      // `resolveSignInRedirectUrl` validates the callback (relative, same-
      // origin) and is SSR-safe; the default lands on the shared sign-in
      // fallback (/onboarding or NEXT_PUBLIC_SIGN_IN_FALLBACK_REDIRECT_URL).
      await signInWithGoogle(resolveSignInRedirectUrl(redirectUrl ?? null));
      // The social flow normally ends in a full-page redirect to Google and
      // back; when it completes in-page, re-run the gate.
      (onAuthenticated ?? defaultOnAuthenticated)();
    } catch {
      setError("Could not start Google sign-in. Please try again.");
      setIsRedirecting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-app px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 -left-24 h-72 w-72 rounded-full bg-[color:var(--accent-soft)] blur-3xl" />
        <div className="absolute -right-28 -bottom-24 h-80 w-80 rounded-full bg-[rgba(14,165,233,0.12)] blur-3xl" />
      </div>

      <Card className="relative w-full max-w-lg animate-fade-in-up">
        <CardHeader className="space-y-5 border-b border-[color:var(--border)] pb-5">
          <div className="flex items-center justify-between">
            <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Google sign-in
            </span>
            <div className="rounded-xl bg-white p-2">
              <GoogleLogo className="h-5 w-5" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-strong">
              Sign in to Mission Control
            </h1>
            <p className="text-sm text-muted">
              Use your Google Workspace account to continue.
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <Button
            type="button"
            className="flex w-full items-center justify-center gap-3"
            size="lg"
            disabled={isRedirecting}
            onClick={() => {
              void handleSignIn();
            }}
            data-testid="google-sign-in-button"
          >
            <GoogleLogo className="h-4 w-4" />
            {isRedirecting ? "Redirecting to Google..." : "Sign in with Google"}
          </Button>
          {error ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : (
            <p className="mt-4 text-xs text-muted">
              You must use an allowed Google Workspace account.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
