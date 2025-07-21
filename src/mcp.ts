import { csn } from "@sap/cds";
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

    LOGGER.debug("TESTING - Annotations", this.annotations);
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
        await session.transport.handleRequest(req, res, req.body);
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
}
