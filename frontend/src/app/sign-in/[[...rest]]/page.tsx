"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { isBetterAuthMode } from "@/auth/betterAuth";
import { useBetterAuthSession } from "@/auth/betterAuthSession";
import { isLocalAuthMode } from "@/auth/localAuth";
import { resolveSignInRedirectUrl } from "@/auth/redirects";
import { BetterAuthLogin } from "@/components/organisms/BetterAuthLogin";
import { LocalAuthLogin } from "@/components/organisms/LocalAuthLogin";

export default function SignInPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const betterAuth = useBetterAuthSession();

  useEffect(() => {
    if (!isBetterAuthMode() || !betterAuth.isLoaded || !betterAuth.isSignedIn) {
      return;
    }
    router.replace(
      resolveSignInRedirectUrl(searchParams.get("redirect_url")),
    );
  }, [
    betterAuth.isLoaded,
    betterAuth.isSignedIn,
    router,
    searchParams,
  ]);

  if (isLocalAuthMode()) {
    return <LocalAuthLogin />;
  }

  if (isBetterAuthMode()) {
    if (!betterAuth.isLoaded || betterAuth.isSignedIn) {
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
    const redirectUrl = resolveSignInRedirectUrl(
      searchParams.get("redirect_url"),
    );
    return <BetterAuthLogin redirectUrl={redirectUrl} />;
  }

  // NEXT_PUBLIC_AUTH_MODE must be "local" or "betterauth".
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          Authentication is unavailable
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          No auth mode is configured for this deployment. Set{" "}
          <code>NEXT_PUBLIC_AUTH_MODE=betterauth</code> for Google sign-in or{" "}
          <code>NEXT_PUBLIC_AUTH_MODE=local</code> for token-based local access.
        </p>
      </div>
    </main>
  );
}
