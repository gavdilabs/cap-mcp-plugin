import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { csn } from "@sap/cds";
import { Application } from "express";
import { LOGGER } from "./logger";
import { randomUUID } from "crypto";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { ParsedAnnotations } from "./annotations/types";
import { parseDefinitions } from "./annotations/parser";
import { McpSession } from "./mcp/types";
import { handleMcpSessionRequest } from "./mcp/utils";
import { createMcpServer } from "./mcp/factory";
import { MCP_SESSION_HEADER } from "./mcp/constants";
import { CAPConfiguration } from "./config/types";
import { loadConfiguration } from "./config/loader";
import { isTestEnvironment } from "./config/env-sanitizer";

/* @ts-ignore */
const cds = global.cds || require("@sap/cds"); // This is a work around for missing cds context

// TODO: Handle auth

export default class McpPlugin {
  private readonly sessions: Map<string, McpSession>;
  private readonly config: CAPConfiguration;
  private expressApp?: Application;
  private annotations?: ParsedAnnotations;

  /**
   * Initializes a new MCP plugin instance
   */
  constructor() {
    LOGGER.debug("Plugin instance created");
    this.sessions = new Map<string, McpSession>();
    this.config = loadConfiguration();

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
    for (const session of this.sessions.values()) {
      await session.server.close();
    }
    LOGGER.debug("MCP server sessions has been shutdown");
  }

  /**
   * Registers API endpoints for MCP server communication
   */
  private async registerApiEndpoints(): Promise<void> {
    LOGGER.debug("Registering health endpoint for MCP");
    this.expressApp?.get("/mcp/health", (_, res) => {
      res.json({
        status: "UP",
      });
    });

    LOGGER.debug("Registering MCP entry point");
    this.expressApp?.post("/mcp", async (req, res) => {
      const sessionIdHeader = req.headers[MCP_SESSION_HEADER] as string;
      let sessionEntry: McpSession | undefined = undefined;

      LOGGER.debug("MCP request received", {
        hasSessionId: !!sessionIdHeader,
        isInitialize: isInitializeRequest(req.body),
        contentType: req.headers["content-type"],
      });

      if (sessionIdHeader && this.sessions.has(sessionIdHeader)) {
        LOGGER.debug("Request received - Session ID", sessionIdHeader);
        sessionEntry = this.sessions.get(sessionIdHeader);
      } else if (!sessionIdHeader && isInitializeRequest(req.body)) {
        LOGGER.debug("Initialize session request received");
        const server = createMcpServer(this.config, this.annotations);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: isTestEnvironment(),
          onsessioninitialized: (sid) => {
            LOGGER.debug("Session initialized with ID:", sid);
            this.sessions.set(sid, {
              server: server,
              transport: transport,
            });
          },
        });

        transport.onclose = () => {
          if (!transport.sessionId || !this.sessions.has(transport.sessionId))
            return;
          this.sessions.delete(transport.sessionId);
        };

        await server.connect(transport);

        // Handle initialization request immediately and return
        try {
          await transport.handleRequest(req, res, req.body);
          return;
        } catch (error) {
          LOGGER.error("Initialization error:", error);
          if (!res.headersSent) {
            res.status(500).json({
              jsonrpc: "2.0",
              error: {
                code: -32603,
                message: "Internal Error: Initialization failed",
                id: null,
              },
            });
          }
          return;
        }
      } else {
        LOGGER.debug("Invalid request - no session ID and not initialize");
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

      // Handle requests with existing session
      if (sessionEntry) {
        try {
          await sessionEntry.transport.handleRequest(req, res, req.body);
        } catch (error) {
          LOGGER.error("Transport error:", error);
          if (!res.headersSent) {
            res.status(500).json({
              jsonrpc: "2.0",
              error: {
                code: -32603,
                message: "Internal Error: Transport failed",
                id: null,
              },
            });
          }
        }
      }
    });

    this.expressApp?.get("/mcp", (req, res) =>
      handleMcpSessionRequest(req, res, this.sessions),
    );

    this.expressApp?.delete("/mcp", (req, res) =>
      handleMcpSessionRequest(req, res, this.sessions),
    );
  }
}
