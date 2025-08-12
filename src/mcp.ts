import type { csn, User } from "@sap/cds";
import { Application, RequestHandler } from "express";
import { LOGGER } from "./logger";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { ParsedAnnotations } from "./annotations/types";
import { parseDefinitions } from "./annotations/parser";
import { handleMcpSessionRequest } from "./mcp/utils";
import { MCP_SESSION_HEADER } from "./mcp/constants";
import { CAPConfiguration } from "./config/types";
import { loadConfiguration } from "./config/loader";
import { McpSessionManager } from "./mcp/session-manager";
import { authHandlerFactory } from "./auth/handler";
import { registerAuthMiddleware } from "./auth/utils";

/* @ts-ignore */
const cds = (global as any).cds; // Use hosting app's CDS instance exclusively

// TODO: Handle auth

/**
 * Main MCP plugin class that integrates CAP services with Model Context Protocol
 * Manages server sessions, API endpoints, and annotation processing
 */
export default class McpPlugin {
  private readonly sessionManager: McpSessionManager;
  private readonly config: CAPConfiguration;
  private expressApp?: Application;
  private annotations?: ParsedAnnotations;

  /**
   * Creates a new MCP plugin instance with configuration and session management
   */
  constructor() {
    LOGGER.debug("Plugin instance created");
    this.config = loadConfiguration();
    this.sessionManager = new McpSessionManager();

    LOGGER.debug("Running with configuration", this.config);
  }

  /**
   * Handles the bootstrap event by setting up Express app and API endpoints
   * @param app - Express application instance
   */
  public async onBootstrap(app: Application): Promise<void> {
    LOGGER.debug("Event received for 'bootstrap'");
    this.expressApp = app;
    this.expressApp.use(express.json());

    if (this.config.auth === "inherit") {
      registerAuthMiddleware(this.expressApp);
    }

    await this.registerApiEndpoints();
    LOGGER.debug("Bootstrap complete");
  }

  /**
   * Handles the loaded event by parsing model definitions for MCP annotations
   * @param model - CSN model containing definitions
   */
  public async onLoaded(model: csn.CSN): Promise<void> {
    LOGGER.debug("Event received for 'loaded'");
    this.annotations = parseDefinitions(model);
    LOGGER.debug("Annotations have been loaded");
  }

  /**
   * Handles the shutdown event by gracefully closing all MCP server sessions
   */
  public async onShutdown(): Promise<void> {
    LOGGER.debug("Gracefully shutting down MCP server");
    for (const session of this.sessionManager.getSessions().values()) {
      await session.transport.close();
      await session.server.close();
    }
    LOGGER.debug("MCP server sessions has been shutdown");
  }

  /**
   * Sets up HTTP endpoints for MCP communication and health checks
   * Registers /mcp and /mcp/health routes with appropriate handlers
   */
  private async registerApiEndpoints(): Promise<void> {
    if (!this.expressApp) {
      LOGGER.warn(
        "Cannot register MCP server as there is no available express layer",
      );
      return;
    }

    LOGGER.debug("Registering health endpoint for MCP");
    this.expressApp?.get("/mcp/health", (_, res) => {
      res.json({
        status: "UP",
      });
    });

    this.registerMcpSessionRoute();

    this.expressApp?.get("/mcp", (req, res) =>
      handleMcpSessionRequest(req, res, this.sessionManager.getSessions()),
    );

    this.expressApp?.delete("/mcp", (req, res) =>
      handleMcpSessionRequest(req, res, this.sessionManager.getSessions()),
    );
  }

  /**
   * Registers the main MCP POST endpoint for session creation and request handling
   * Handles session initialization and routes requests to appropriate sessions
   */
  private registerMcpSessionRoute(): void {
    LOGGER.debug("Registering MCP entry point");

    // Test log to verify logger is working
    LOGGER.info("MCP endpoint registration started");
    LOGGER.debug("MCP endpoint registration debug test");
    LOGGER.warn("MCP endpoint registration warning test");

    this.expressApp?.post("/mcp", (req, res) => {
      LOGGER.debug("CONTEXT", cds.context); // TODO: Remove this line after testing
      try {
        // Shallow log of incoming method to trace timeouts/hangs without leaking sensitive payloads
        const method =
          typeof req.body?.method === "string" ? req.body.method : undefined;
        const toolOrResource = req.body?.params?.name || req.body?.params?.uri;
        const id = req.body?.id;
        const requiresResponse = typeof id !== "undefined";
        LOGGER.debug("MCP JSON-RPC", {
          method,
          toolOrResource,
          id,
          requiresResponse,
        });
      } catch (e) {
        // Defensive: never let logging break the handler
        LOGGER.warn("Failed to log MCP JSON-RPC overview", e);
      }

      // Enhanced response logger: intercept res.json/res.send once per request
      try {
        // Store original methods
        const originalJson = res.json;
        const originalSend = res.send;

        // Override json method with proper binding
        res.json = function (body: any) {
          try {
            LOGGER.info("MCP response (json) - RESPONSE LOGGER WORKING!", {
              statusCode: res.statusCode,
              body: body,
            });
            // Fallback console.log to ensure visibility
            console.log("🎯 MCP RESPONSE LOGGER (json):", {
              statusCode: res.statusCode,
              body: body,
            });
          } catch (logError) {
            LOGGER.warn("Failed to log MCP JSON response", logError);
            console.error("❌ MCP JSON response logger failed:", logError);
          }
          return originalJson.call(this, body);
        };

        // Override send method with proper binding
        res.send = function (body: any) {
          try {
            let out: any = body;
            // Avoid logging raw buffers unreadably
            if (Buffer.isBuffer(body)) {
              out = body.toString("utf8");
            }
            LOGGER.info("MCP response (send) - RESPONSE LOGGER WORKING!", {
              statusCode: res.statusCode,
              body: out,
            });
            // Fallback console.log to ensure visibility
            console.log("🎯 MCP RESPONSE LOGGER (send):", {
              statusCode: res.statusCode,
              body: out,
            });
          } catch (logError) {
            LOGGER.warn("Failed to log MCP send response", logError);
            console.error("❌ MCP send response logger failed:", logError);
          }
          return originalSend.call(this, body);
        };

        LOGGER.debug("Response logger attached successfully");
      } catch (e) {
        LOGGER.warn("Failed to attach response logger", e);
      }
      const sessionIdHeader = req.headers[MCP_SESSION_HEADER] as string;
      const originalAccept = String(req.headers["accept"] || "");
      const contentType = String(req.headers["content-type"] || "");
      const wantsJson = originalAccept.includes("application/json");
      const wantsSse = originalAccept.includes("text/event-stream");
      if (!wantsJson || !wantsSse) {
        const patched = "application/json,text/event-stream";
        req.headers["accept"] = patched;
        LOGGER.warn(
          "Patched Accept header to ensure compatibility with MCP transport",
          {
            originalAccept,
            patchedAccept: patched,
          },
        );
      }
      LOGGER.debug("MCP request received", {
        hasSessionId: !!sessionIdHeader,
        isInitialize: isInitializeRequest(req.body),
        accept: req.headers["accept"],
        contentType,
      });

      (async () => {
        let session =
          !sessionIdHeader && isInitializeRequest(req.body)
            ? await this.sessionManager.createSession(
                this.config,
                this.annotations,
              )
            : this.sessionManager.getSession(sessionIdHeader);

        // Strict: if no session is found and this isn't an initialize, reject per spec
        if (!session) {
          if (!isInitializeRequest(req.body)) {
            // If auth is enabled and missing/invalid, return 401 to reflect auth boundary first
            if (this.config.auth === "inherit") {
              return res
                .status(401)
                .json({ error: { code: 10, message: "Unauthorized" } });
            }
            res.status(400).json({
              error: {
                code: -32000,
                message: "No valid sessions ID provided",
              },
            });
            return;
          }
        }
        if (!session) return; // Type narrowing for TS

        try {
          const t0 = Date.now();
          await session.transport.handleRequest(req, res, req.body);
          // Allow one tick for flushing
          await new Promise((r) => setImmediate(r));
          LOGGER.debug("MCP request handled", { durationMs: Date.now() - t0 });
          // Additional logging to verify response was sent
          const requiresResponse = typeof req.body?.id !== "undefined";
          if (res.headersSent) {
            LOGGER.debug("Response headers were sent successfully");
          } else if (requiresResponse) {
            LOGGER.warn(
              "Response headers were not sent - request had an id and expected a response",
            );
            // Defensive fallback to avoid client hangs (e.g., OpenAI)
            // For tools/call specifically, return a spec-compliant 'result' with content instead of JSON-RPC error
            const isToolsCall = req.body?.method === "tools/call";
            const fallbackResult = isToolsCall
              ? {
                  jsonrpc: "2.0",
                  id: req.body?.id ?? null,
                  result: {
                    content: [
                      {
                        type: "text",
                        text: "MCP transport did not produce a response. Hint: Ensure Accept includes application/json and text/event-stream and a valid mcp-session-id is forwarded.",
                      },
                    ],
                  },
                }
              : {
                  jsonrpc: "2.0",
                  id: req.body?.id ?? null,
                  error: {
                    code: -32000,
                    message: "No response produced by MCP transport",
                    data: {
                      hint: "Ensure Accept includes application/json and text/event-stream and a valid mcp-session-id is forwarded",
                      originalAccept,
                      effectiveAccept: req.headers["accept"],
                      hasSessionId: !!sessionIdHeader,
                    },
                  },
                };
            try {
              if (!res.headersSent) res.status(200).json(fallbackResult);
            } catch (_) {}
          } else {
            LOGGER.debug("No response expected (notification)");
          }

          return;
        } catch (e) {
          LOGGER.error("MCP request handling failed", e);
          if (res.headersSent) return;
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal Error: Transport failed",
              id: null,
            },
          });
          return;
        }
      })().catch((e) => {
        LOGGER.error("Unhandled MCP handler error", e);
        if (!res.headersSent) {
          res
            .status(500)
            .json({ error: { code: -32603, message: "Internal Error" } });
        }
      });
    });
  }
}
