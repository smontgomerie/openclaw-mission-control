import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/better-auth";

// Catch-all Better Auth route. The app stays buildable/bootable without the
// BETTER_AUTH_* env vars: the instance is only built on the first request,
// and a missing/placeholder var fails that request with a clear 500 instead
// of breaking the whole app (local/clerk flows are untouched).
export const { GET, POST } = toNextJsHandler((request: Request) =>
  getAuth().handler(request),
);
