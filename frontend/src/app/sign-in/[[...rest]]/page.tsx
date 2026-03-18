"use client";

import { useSearchParams } from "next/navigation";
import { SignIn } from "@clerk/nextjs";

import { isClerkEnabled } from "@/auth/clerk";
import { isLocalAuthMode } from "@/auth/localAuth";
import { resolveSignInRedirectUrl } from "@/auth/redirects";
import { LocalAuthLogin } from "@/components/organisms/LocalAuthLogin";

export default function SignInPage() {
  const searchParams = useSearchParams();

  if (isLocalAuthMode()) {
    return <LocalAuthLogin />;
  }

  if (!isClerkEnabled()) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">
            Authentication is unavailable
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            This environment is set to use Clerk, but no valid Clerk publishable
            key is configured. Set <code>NEXT_PUBLIC_AUTH_MODE=local</code> for
            token-based local access or provide a real Clerk publishable key.
          </p>
        </div>
      </main>
    );
  }

  const forceRedirectUrl = resolveSignInRedirectUrl(
    searchParams.get("redirect_url"),
  );

  // Dedicated sign-in route for Cypress E2E.
  // Avoids modal/iframe auth flows and gives Cypress a stable top-level page.
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <SignIn
        routing="path"
        path="/sign-in"
        forceRedirectUrl={forceRedirectUrl}
      />
    </main>
  );
}
