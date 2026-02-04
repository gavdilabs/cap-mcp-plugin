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
 * Mapping of the custom annotations + CDS specific annotations and their correlated mapping for MCP usage
 */
export const MCP_ANNOTATION_MAPPING = new Map<string, string>([
  ["@mcp.name", "name"],
  ["@mcp.description", "description"],
  ["@mcp.resource", "resource"],
  ["@mcp.tool", "tool"],
  ["@mcp.prompts", "prompts"],
  ["@mcp.wrap", "wrap"],
  ["@mcp.wrap.tools", "wrap.tools"],
  ["@mcp.wrap.modes", "wrap.modes"],
  ["@mcp.wrap.name", "wrap.name"],
  ["@mcp.wrap.hint", "wrap.hint"],
  ["@mcp.wrap.hint.get", "wrap.hint.get"],
  ["@mcp.wrap.hint.query", "wrap.hint.query"],
  ["@mcp.wrap.hint.create", "wrap.hint.create"],
  ["@mcp.wrap.hint.update", "wrap.hint.update"],
  ["@mcp.wrap.hint.delete", "wrap.hint.delete"],
  ["@mcp.elicit", "elicit"],
  ["@requires", "requires"],
  ["@restrict", "restrict"],
]);

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

/**
 * Hint key for annotations made on specific properties/elements
 */
export const MCP_HINT_ELEMENT = "@mcp.hint";

/**
 * MCP omit property annotation key
 */
export const MCP_OMIT_PROP_KEY = "@mcp.omit";
