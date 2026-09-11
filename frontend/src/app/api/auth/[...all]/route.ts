import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/better-auth";

// Catch-all Better Auth route. The app stays buildable/bootable without the
// BETTER_AUTH_* env vars: the instance is only built on the first request,
// and a missing/placeholder var fails that request with a clear 500 instead
// of breaking the whole app (the local flow is untouched).
const { GET: handleGet, POST: handlePost } = toNextJsHandler(
  (request: Request) => getAuth().handler(request),
);

function logOAuthCallback(request: Request): void {
  const url = new URL(request.url);
  if (!url.pathname.includes("/callback/")) {
    return;
  }
  console.warn("[better-auth] oauth callback", {
    method: request.method,
    path: url.pathname,
    hasCode: url.searchParams.has("code"),
    hasState: url.searchParams.has("state"),
    hasError: url.searchParams.has("error"),
    error: url.searchParams.get("error"),
    host: request.headers.get("host"),
    xForwardedHost: request.headers.get("x-forwarded-host"),
    xForwardedProto: request.headers.get("x-forwarded-proto"),
  });
}

export async function GET(request: Request) {
  logOAuthCallback(request);
  return handleGet(request);
}

export async function POST(request: Request) {
  logOAuthCallback(request);
  return handlePost(request);
}
