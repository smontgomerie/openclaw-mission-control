import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { defaultConfig } from "./config.js";
import { MissionControlApiError } from "./http.js";
import {
  getPositionInputSchema,
  listPositionsInputSchema,
  listReviewsInputSchema,
  portfolioGetPosition,
  portfolioListPositions,
  portfolioListReviews,
  portfolioSaveRationale,
  portfolioSyncNow,
  portfolioUndoRoll,
  saveRationaleInputSchema,
  undoRollInputSchema,
} from "./tools/portfolio.js";

function formatResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function formatError(error: unknown): never {
  if (error instanceof MissionControlApiError) {
    throw new Error(`Mission Control API ${error.status}: ${error.message}`);
  }
  if (error instanceof Error) {
    throw error;
  }
  throw new Error("Unknown Mission Control MCP failure.");
}

const config = defaultConfig();
const server = new McpServer({
  name: "mission-control-server",
  version: "0.1.0",
});

server.tool(
  "portfolio_list_positions",
  "List portfolio positions from Mission Control, with optional ticker, rationale, and flag filters.",
  listPositionsInputSchema,
  async (input) => {
    try {
      return formatResult(await portfolioListPositions(config, input));
    } catch (error) {
      formatError(error);
    }
  },
);

server.tool(
  "portfolio_get_position",
  "Fetch full portfolio position detail, including current rationale and latest linked review summary.",
  getPositionInputSchema,
  async (input) => {
    try {
      return formatResult(await portfolioGetPosition(config, input));
    } catch (error) {
      formatError(error);
    }
  },
);

server.tool(
  "portfolio_save_rationale",
  "Create or update durable trade rationale for a Mission Control portfolio position.",
  saveRationaleInputSchema,
  async (input) => {
    try {
      return formatResult(await portfolioSaveRationale(config, input));
    } catch (error) {
      formatError(error);
    }
  },
);

server.tool(
  "portfolio_list_reviews",
  "List portfolio reviews, optionally narrowed to one position key and capped by limit.",
  listReviewsInputSchema,
  async (input) => {
    try {
      return formatResult(await portfolioListReviews(config, input));
    } catch (error) {
      formatError(error);
    }
  },
);

server.tool(
  "portfolio_sync_now",
  "Trigger the Mission Control portfolio sync job immediately.",
  async () => {
    try {
      return formatResult(await portfolioSyncNow(config));
    } catch (error) {
      formatError(error);
    }
  },
);

server.tool(
  "portfolio_undo_roll",
  "Dismiss an auto-detected option roll and remove the carried rationale on the new position key.",
  undoRollInputSchema,
  async (input) => {
    try {
      await portfolioUndoRoll(config, input);
      return formatResult({ ok: true });
    } catch (error) {
      formatError(error);
    }
  },
);

const transport = new StdioServerTransport();

server.connect(transport).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
