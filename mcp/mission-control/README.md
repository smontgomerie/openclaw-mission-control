# Mission Control MCP

This package exposes a small MCP stdio server for OpenClaw Mission Control portfolio workflows.

## Required environment

- `MISSION_CONTROL_BASE_URL`
- `MISSION_CONTROL_TOKEN`
- optional `MISSION_CONTROL_TIMEOUT_MS`

`MISSION_CONTROL_TOKEN` must be a Mission Control user bearer token with org-admin access.

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
        "MISSION_CONTROL_TOKEN": "<admin bearer token>"
      }
    }
  }
}
```
