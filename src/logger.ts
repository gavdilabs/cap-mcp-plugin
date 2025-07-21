/**
 * Logger instance for the CDS MCP plugin
 * Uses CAP's built-in logging system with "cds-mcp" namespace
 */

/* @ts-ignore */
const cds = global.cds || require("@sap/cds"); // This is a work around for missing cds context

/**
 * Shared logger instance for all MCP plugin components
 * Provides debug, info, warn, and error logging methods
 */
export const LOGGER = cds.log("cds-mcp");
