import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

import { isLikelyValidClerkPublishableKey } from "@/auth/clerkKey";
import { AuthMode, isBetterAuthMode } from "@/auth/mode";

/**
 * Route protection by mode:
 *
 * - clerk: real middleware (clerkMiddleware) — unauthenticated requests are
 *   redirected to Clerk sign-in before any page/API work.
 * - local: passthrough — the token screen gates the UI client-side and the
 *   backend validates the pasted token.
 * - betterauth: passthrough, deliberately. Better Auth sessions live in
 *   cookies on this app's origin and the Python backend is the security
 *   boundary: it verifies the Better Auth JWT statelessly against the JWKS
 *   and refuses bad credentials. Route protection in this mode stays
 *   client-side (the SignedIn/SignedOut gates in `@/auth/clerk` plus the
 *   AuthProvider gate), so we do not add a second, server-side middleware
 *   piece here. Note: a configured Clerk key must not leak its redirect
 *   behaviour into a betterauth deployment — hence the explicit mode check.
 *
 * (Next.js 16 renamed `middleware.ts` to `proxy.ts`; this file is the live
 * middleware slot, not dead code.)
 */
// Unchanged clerk semantics (enabled when mode is not local AND a valid key
// exists); betterauth mode must not inherit the Clerk redirect behaviour.
const isClerkEnabled = () =>
  process.env.NEXT_PUBLIC_AUTH_MODE !== AuthMode.Local &&
  !isBetterAuthMode() &&
  isLikelyValidClerkPublishableKey(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );

// Public routes include home and sign-in paths to avoid redirect loops.
const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);

function isClerkInternalPath(pathname: string): boolean {
  // Clerk may hit these paths for internal auth/session refresh flows.
  return pathname.startsWith("/_clerk") || pathname.startsWith("/v1/");
}

function requestOrigin(req: Request): string {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost ?? req.headers.get("host");
  const proto = forwardedProto ?? "http";
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

function returnBackUrlFor(req: Request): string {
  const { pathname, search, hash } = new URL(req.url);
  return `${requestOrigin(req)}${pathname}${search}${hash}`;
}

export default isClerkEnabled()
  ? clerkMiddleware(async (auth, req) => {
      if (isClerkInternalPath(new URL(req.url).pathname)) {
        return NextResponse.next();
      }
      if (isPublicRoute(req)) return NextResponse.next();

      // In middleware, `auth()` resolves to a session/auth context (Promise in current typings).
      // Use redirectToSignIn() (instead of protect()) for unauthenticated requests.
      const { userId, redirectToSignIn } = await auth();
      if (!userId) {
        return redirectToSignIn({ returnBackUrl: returnBackUrlFor(req) });
      }

      return NextResponse.next();
    })
  : () => NextResponse.next();

export const config = {
  matcher: [
    "/((?!_next|_clerk|v1|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
