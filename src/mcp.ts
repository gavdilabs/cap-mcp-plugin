import type { csn } from "@sap/cds";
import { Application } from "express";
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
import { registerAuthMiddleware } from "./auth/utils";
import helmet from "helmet";
import cors from "cors";

/* @ts-ignore */
const cds = (global as any).cds; // Use hosting app's CDS instance exclusively

/**
 * Main MCP plugin class that integrates CAP services with Model Context Protocol
 * Manages server sessions, API endpoints, and annotation processing
 */
export default class McpPlugin {
  private readonly sessionManager: McpSessionManager;
  private readonly config: CAPConfiguration;
  private expressApp?: Application;
  private annotations?: ParsedAnnotations;
  private static _instance?: McpPlugin;
  private static isInitializing: boolean = false;
  /**
   * Creates a new MCP plugin instance with configuration and session management
   */
  private constructor() {
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
    this.expressApp.use("/mcp", express.json());
    // Only needed to use MCP Inspector in local browser:
    this.expressApp.use(
      ["/oauth", "/.well-known"],
      cors({ origin: "http://localhost:6274" }),
    );

    // Apply helmet security middleware only to MCP routes
    this.expressApp.use(
      "/mcp",
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
          },
        },
      }),
    );

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

    this.expressApp?.delete("/mcp", ((req: any, res: any) => {
      const sessionIdHeader = req.headers[MCP_SESSION_HEADER] as string;
      const sessions = this.sessionManager.getSessions();
      if (!sessionIdHeader || !sessions.has(sessionIdHeader)) {
        return res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid sessions ID provided",
            id: null,
          },
        });
      }
      const session = sessions.get(sessionIdHeader)!;
      // Fire-and-forget close operations
      void session.transport.close();
      void session.server.close();
      sessions.delete(sessionIdHeader);
      return res.status(200).json({ jsonrpc: "2.0", result: { closed: true } });
    }) as any);
  }

  /**
   * Registers the main MCP POST endpoint for session creation and request handling
   * Handles session initialization and routes requests to appropriate sessions
   */
  private registerMcpSessionRoute(): void {
    LOGGER.debug("Registering MCP entry point");

    this.expressApp?.post("/mcp", async (req, res) => {
      const sessionIdHeader = req.headers[MCP_SESSION_HEADER] as string;
      LOGGER.debug("MCP request received", {
        hasSessionId: !!sessionIdHeader,
        isInitialize: isInitializeRequest(req.body),
        contentType: req.headers["content-type"],
      });
      const session =
        !sessionIdHeader && isInitializeRequest(req.body)
          ? await this.sessionManager.createSession(
              this.config,
              this.annotations,
            )
          : this.sessionManager.getSession(sessionIdHeader);

      if (!session) {
        LOGGER.error("Invalid session ID", sessionIdHeader);
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid sessions ID provided",
            id: null,
          },
        });
        return;
      }

      try {
        const t0 = Date.now();
        await session.transport.handleRequest(req, res, req.body);
        LOGGER.debug("MCP request handled", { durationMs: Date.now() - t0 });
        return;
      } catch (e) {
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
    });
  }

  /**
   * Get McpPlugin Instance
   *
   * @description  Double Lock singleton initialization.
   * @returns McpPlugin
   */
  public static getInstance(): McpPlugin {
    if (!McpPlugin._instance) {
      if (!McpPlugin.isInitializing) {
        McpPlugin.isInitializing = true;

        if (!McpPlugin._instance) {
          McpPlugin._instance = new McpPlugin();
        }
        McpPlugin.isInitializing = false;
      } else {
        /**
         * Busy Wait if it is initializing
         */
        while (McpPlugin.isInitializing) {}
        /**
         * check if not init, call again.
         */
        if (!McpPlugin._instance) {
          return McpPlugin.getInstance();
        }
      }
    }
    return McpPlugin._instance;
  }

  public static resetInstance() {
    McpPlugin._instance = undefined;
  }
}
