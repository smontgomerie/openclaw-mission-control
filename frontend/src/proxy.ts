import { NextResponse } from "next/server";

// Next.js 16 renamed `middleware.ts` to `proxy.ts`; this file is the
// server-side middleware slot.
//
// It is a deliberate no-op: route protection is client-side. In
// `betterauth` mode the security boundary is the Python backend, which
// verifies the Better Auth JWT statelessly against the app's JWKS endpoint;
// in `local` mode the pasted-token screen gates the UI and the backend
// validates the token. Do not add server-side auth redirects here — the
// signed-in/signed-out gates live in `@/auth/session` and `AuthProvider`.
export default function proxy() {
  return NextResponse.next();
}
