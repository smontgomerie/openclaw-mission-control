# Mission Control MCP

This package exposes a small MCP stdio server for OpenClaw Mission Control portfolio workflows.

## Required environment

- `MISSION_CONTROL_BASE_URL`
- One credential, either:
  - `MISSION_CONTROL_TOKEN` — a Mission Control user bearer token with
    org-admin access (local-auth mode), or
  - `MISSION_CONTROL_API_KEY` (`mc_...` Better Auth API key, issued per
    user, individually revocable) **plus** `MISSION_CONTROL_BETTER_AUTH_URL`
    — the Better Auth app origin (e.g. `http://localhost:3000`). The key is
    exchanged for a short-lived session JWT at
    `{$BETTER_AUTH_URL}/api/auth/token`, which the backend verifies against
    its JWKS. When a key is set it takes precedence over
    `MISSION_CONTROL_TOKEN`. See `docs/reference/authentication.md`
    (Machine clients) for key issue/revoke.
- optional `MISSION_CONTROL_TIMEOUT_MS`

## Available tools

- `portfolio_list_positions`
- `portfolio_get_position`
- `portfolio_save_rationale`
- `portfolio_list_reviews`
- `portfolio_sync_now`

## Development

```bash
npm install
npm run build
```

The build regenerates the HTTP client from Mission Control OpenAPI before compiling the server.

## OpenClaw / mcporter example

```json
{
  "mcpServers": {
    "mission-control": {
      "command": "node",
      "args": [
        "/absolute/path/to/openclaw-mission-control/mcp/mission-control/dist/src/server.js"
      ],
      "env": {
        "MISSION_CONTROL_BASE_URL": "http://127.0.0.1:8000",
        "MISSION_CONTROL_API_KEY": "mc_<64+ random chars>",
        "MISSION_CONTROL_BETTER_AUTH_URL": "http://localhost:3000"
      }
    }
  }
}
```
