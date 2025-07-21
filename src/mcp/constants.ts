/**
 * Constants used throughout the MCP (Model Context Protocol) implementation
 * Defines error messages, HTTP headers, and formatting constants
 */

/**
 * Standard error message returned when a CAP service cannot be found or accessed
 * Used in tool execution when the target service is unavailable
 */
export const ERR_MISSING_SERVICE = "Error: Service could not be found";

/**
 * HTTP header name used to identify MCP session IDs in requests
 * Client must include this header with a valid session ID for authenticated requests
 */
export const MCP_SESSION_HEADER = "mcp-session-id";

/**
 * Newline character constant used for consistent text formatting
 * Used in resource descriptions and error message formatting
 */
export const NEW_LINE = "\n";
