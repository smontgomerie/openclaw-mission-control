# MCP integration

Mission Control can be exposed to OpenClaw as an MCP stdio server using the in-repo package at `mcp/mission-control/`.

## What it provides

V1 focuses on portfolio workflows:

- `portfolio_list_positions`
- `portfolio_get_position`
- `portfolio_save_rationale`
- `portfolio_list_reviews`
- `portfolio_sync_now`
- `portfolio_undo_roll` — dismiss an auto-detected option roll and remove the carried rationale on the new `position_key` (`POST /api/v1/portfolio/roll-events/{event_id}/undo`).

These tools call the existing Mission Control HTTP API. They do not post to Discord, Telegram, or other channel targets.

## Auth model

The MCP server expects a Mission Control **user bearer token** with organization-admin access.

Required environment:

- `MISSION_CONTROL_BASE_URL`
- `MISSION_CONTROL_TOKEN`
- optional `MISSION_CONTROL_TIMEOUT_MS`

## Build

From repo root:

```bash
make mcp-build
```

This will:

1. export `backend/openapi.json`
2. regenerate the MCP package's typed client
3. compile the MCP server to `mcp/mission-control/dist/`

## OpenClaw configuration

Example `mcporter.json` entry:

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

For OpenClaw CLI installs, the default config path is usually `~/.openclaw/openclaw.json`.

## How OpenClaw actually calls it

Registering the MCP server only makes the Mission Control tools available. OpenClaw still chooses whether
to call them based on the user request and the agent instructions.

Practical pattern:

1. Build the MCP package with `make mcp-build`.
2. Add the `mcpServers.mission-control` entry to your OpenClaw config.
3. Restart OpenClaw so it reloads the MCP server definition.
4. Give the agent instructions that make Mission Control the default source for portfolio actions.

Useful agent instruction snippet:

```md
When the user asks about portfolio positions, reviews, rationale, or syncing portfolio data,
use the `mission-control` MCP tools instead of guessing from memory.
```

Example prompts that should cause tool use:

- `List current portfolio positions from Mission Control.`
- `Get the Mission Control position detail for AAPL.`
- `Save this rationale to Mission Control for TSLA: ...`
- `Trigger a Mission Control portfolio sync now.`

If OpenClaw still does not call the tools, the usual causes are:

- the MCP server was added to config but OpenClaw was not restarted
- `MISSION_CONTROL_BASE_URL` or `MISSION_CONTROL_TOKEN` is missing/invalid
- the prompt is too vague, so the model does not infer that a Mission Control tool is appropriate
- the agent instructions do not mention Mission Control or portfolio MCP usage

## Development notes

- The package is intentionally in this repo so it versions with the API and OpenAPI schema.
- The server uses curated MCP tool names over a generated OpenAPI client.
- The generated schema artifact `backend/openapi.json` is local build output and is gitignored.
