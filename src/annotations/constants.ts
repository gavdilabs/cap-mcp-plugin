import { McpResourceOption } from "./types";

// TODO: JSDocs

export const MCP_ANNOTATION_KEY = "@mcp";
export const MCP_ANNOTATION_PROPS = {
  // Standard annotations - required for all
  MCP_NAME: "@mcp.name",
  MCP_DESCRIPTION: "@mcp.description",
  // Resource annotations for MCP
  MCP_RESOURCE: "@mcp.resource",
  // Tool annotations for MCP
  MCP_TOOL: "@mcp.tool",
  // Prompt annotations for MCP
  MCP_PROMPT: "@mcp.prompts",
};

export const DEFAULT_ALL_RESOURCE_OPTIONS = new Set<McpResourceOption>([
  "filter",
  "orderby",
  "top",
  "skip",
  "select",
]);
