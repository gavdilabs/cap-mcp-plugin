import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ParsedAnnotations } from "../annotations/types";
import { LOGGER } from "../logger";
import {
  McpPromptAnnotation,
  McpResourceAnnotation,
  McpToolAnnotation,
} from "../annotations/structures";
import { assignToolToServer } from "./tools";
import { assignResourceToServer } from "./resources";
import { CAPConfiguration } from "../config/types";
import { assignPromptToServer } from "./prompts";

/**
 * Creates and configures an MCP server instance with the given configuration and annotations
 * @param config - CAP configuration object
 * @param annotations - Optional parsed annotations to register with the server
 * @returns Configured MCP server instance
 */
export function createMcpServer(
  config: CAPConfiguration,
  annotations?: ParsedAnnotations,
): McpServer {
  LOGGER.debug("Creating MCP server instance");
  const server = new McpServer({
    name: config.name,
    version: config.version,
    capabilities: config.capabilities,
  });

  if (!annotations) {
    LOGGER.debug("No annotations provided, skipping registration...");
    return server;
  }

  LOGGER.debug("Annotations found for server: ", annotations);

  // TODO: Error handling
  // TODO: Handle auth
  for (const entry of annotations.values()) {
    if (entry instanceof McpToolAnnotation) {
      assignToolToServer(entry, server);
      continue;
    } else if (entry instanceof McpResourceAnnotation) {
      assignResourceToServer(entry, server);
      continue;
    } else if (entry instanceof McpPromptAnnotation) {
      assignPromptToServer(entry, server);
      continue;
    }
    LOGGER.warn(
      "Invalid annotation entry - Cannot be parsed by MCP server, skipping...",
    );
  }

  return server;
}
