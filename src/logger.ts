/**
 * Logger instance for the CDS MCP plugin
 * Uses CAP's built-in logging system with "cds-mcp" namespace
 */

/* @ts-ignore */
const cds = global.cds || require("@sap/cds"); // This is a work around for missing cds context

// In some test/mocked environments cds.log may not exist. Provide a no-op fallback.
const safeLog = (ns: string) => {
  try {
    if (typeof (cds as any)?.log === "function") return (cds as any).log(ns);
  } catch {}
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as any;
};

// Create both channels so logs show up even if the app configured "mcp" instead of "cds-mcp"
const loggerPrimary = safeLog("cds-mcp");
const loggerCompat = safeLog("mcp");

/**
 * Shared logger instance for all MCP plugin components
 * Multiplexes logs to both "cds-mcp" and legacy "mcp" channels for visibility
 */
export const LOGGER = {
  debug: (...args: unknown[]) => {
    try {
      loggerPrimary?.debug?.(...(args as any));
      loggerCompat?.debug?.(...(args as any));
    } catch {}
  },
  info: (...args: unknown[]) => {
    try {
      loggerPrimary?.info?.(...(args as any));
      loggerCompat?.info?.(...(args as any));
    } catch {}
  },
  warn: (...args: unknown[]) => {
    try {
      loggerPrimary?.warn?.(...(args as any));
      loggerCompat?.warn?.(...(args as any));
    } catch {}
  },
  error: (...args: unknown[]) => {
    try {
      loggerPrimary?.error?.(...(args as any));
      loggerCompat?.error?.(...(args as any));
    } catch {}
  },
};
