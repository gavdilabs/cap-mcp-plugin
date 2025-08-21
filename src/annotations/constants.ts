import { McpResourceOption } from "./types";

/**
 * MCP annotation constants and default configurations
 * Defines the standard annotation keys and default values used throughout the plugin
 */

/**
 * Base key used to identify MCP annotations in CDS definitions
 * All MCP annotations must start with this prefix
 */
export const MCP_ANNOTATION_KEY = "@mcp";

/**
 * Complete set of supported MCP annotation property names
 * Maps logical names to their actual annotation keys used in CDS files
 */
export const MCP_ANNOTATION_PROPS = {
  /** Name identifier annotation - required for all MCP elements */
  MCP_NAME: "@mcp.name",
  /** Description annotation - required for all MCP elements */
  MCP_DESCRIPTION: "@mcp.description",
  /** Resource configuration annotation for CAP entities */
  MCP_RESOURCE: "@mcp.resource",
  /** Tool configuration annotation for CAP functions/actions */
  MCP_TOOL: "@mcp.tool",
  /** Prompt templates annotation for CAP services */
  MCP_PROMPT: "@mcp.prompts",
  /** Wrapper configuration for exposing entities as tools */
  MCP_WRAP: "@mcp.wrap",
};

/**
 * Set of annotations used for CDS auth annotations
 * Maps logical names to their actual annotation keys used in CDS files.
 */
export const CDS_AUTH_ANNOTATIONS = {
  REQUIRES: "@requires",
  RESTRICT: "@restrict",
};

/**
 * Default set of all available OData query options for MCP resources
 * Used when @mcp.resource is set to `true` to enable all capabilities
 * Includes: $filter, $orderby, $top, $skip, $select
 */
export const DEFAULT_ALL_RESOURCE_OPTIONS = new Set<McpResourceOption>([
  "filter",
  "orderby",
  "top",
  "skip",
  "select",
]);
