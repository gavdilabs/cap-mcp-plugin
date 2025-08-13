import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ParsedAnnotations } from "../annotations/types";
import { CAPConfiguration } from "../config/types";
import { McpSession } from "./types";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { getSafeEnvVar, isTestEnvironment } from "../config/env-sanitizer";
import { LOGGER } from "../logger";
import { createMcpServer } from "./factory";

/**
 * Manages active MCP server sessions and their lifecycle
 * Handles session creation, storage, retrieval, and cleanup for MCP protocol communication
 */
export class McpSessionManager {
  /** Map storing active sessions by their unique session IDs */
  private readonly sessions: Map<string, McpSession>;

  /**
   * Creates a new session manager with empty session storage
   */
  constructor() {
    this.sessions = new Map<string, McpSession>();
  }

  /**
   * Retrieves the complete map of active sessions
   * @returns Map of session IDs to their corresponding session objects
   */
  public getSessions(): Map<string, McpSession> {
    return this.sessions;
  }

  /**
   * Checks if a session exists for the given session ID
   * @param sessionID - Unique identifier for the session
   * @returns True if session exists, false otherwise
   */
  public hasSession(sessionID: string): boolean {
    return this.sessions.has(sessionID);
  }

  /**
   * Retrieves a specific session by its ID
   * @param sessionID - Unique identifier for the session
   * @returns Session object if found, undefined otherwise
   */
  public getSession(sessionID: string): McpSession | undefined {
    return this.sessions.get(sessionID);
  }

  /**
   * Creates a new MCP session with server and transport configuration
   * Initializes MCP server with provided annotations and establishes transport connection
   * @param config - CAP configuration for the MCP server
   * @param annotations - Optional parsed MCP annotations for resources, tools, and prompts
   * @returns Promise resolving to the created session object
   */
  public async createSession(
    config: CAPConfiguration,
    annotations?: ParsedAnnotations,
  ): Promise<McpSession> {
    LOGGER.debug("Initialize session request received");
    const server = createMcpServer(config, annotations);
    const transport = this.createTransport(server);

    await server.connect(transport);

    return { server, transport };
  }

  /**
   * Creates and configures HTTP transport for MCP communication
   * Sets up session ID generation, response format, and event handlers
   * @param server - MCP server instance to associate with the transport
   * @returns Configured StreamableHTTPServerTransport instance
   */
  private createTransport(server: McpServer): StreamableHTTPServerTransport {
    // Prefer JSON responses to avoid SSE client compatibility issues in dev/mock
    const enableJson =
      getSafeEnvVar("MCP_ENABLE_JSON", "true") === "true" ||
      isTestEnvironment();

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: enableJson,
      onsessioninitialized: (sid) => {
        LOGGER.debug("Session initialized with ID: ", sid);
        LOGGER.debug("Transport mode", { enableJsonResponse: enableJson });
        this.sessions.set(sid, {
          server: server,
          transport: transport,
        });
      },
    });

    // In JSON response mode, HTTP connections are short-lived per request.
    // Closing the underlying connection does NOT mean the MCP session is over.
    // Avoid deleting the session on close when enableJson is true.
    transport.onclose = () => {
      if (!enableJson) {
        this.onCloseSession(transport);
      }
    };

    return transport;
  }

  /**
   * Handles session cleanup when transport connection closes
   * Removes the session from active sessions map when connection terminates
   * @param transport - Transport instance that was closed
   */
  private onCloseSession(transport: StreamableHTTPServerTransport): void {
    if (!transport.sessionId || !this.sessions.has(transport.sessionId)) {
      return;
    }

    this.sessions.delete(transport.sessionId);
  }
}
