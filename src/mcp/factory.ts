// @ts-ignore - MCP SDK types may not be present at compile time in all environments
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
import { isAuthEnabled } from "../auth/utils";
// Use relative import without extension for ts-jest resolver compatibility
import { registerEntityWrappers } from "./entity-tools";
import { registerDescribeModelTool } from "./describe-model";

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
  const authEnabled = isAuthEnabled(config.auth);

  // Always register discovery tool for better model planning
  registerDescribeModelTool(server);

  for (const entry of annotations.values()) {
    if (entry instanceof McpToolAnnotation) {
      assignToolToServer(entry, server, authEnabled);
      continue;
    } else if (entry instanceof McpResourceAnnotation) {
      assignResourceToServer(entry, server, authEnabled);
      // Optionally expose entities as tools based on global/per-entity switches
      const globalWrap = !!config.wrap_entities_to_actions;
      const localWrap = entry.wrap?.tools;
      const enabled = localWrap === true || (localWrap === undefined && globalWrap);
      if (enabled) {
        const modes = config.wrap_entity_modes ?? ["query", "get"];
        registerEntityWrappers(entry, server, authEnabled, modes);
      }
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
