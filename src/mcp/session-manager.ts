import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ParsedAnnotations } from "../annotations/types";
import { CAPConfiguration } from "../config/types";
import { McpSession } from "./types";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { isTestEnvironment } from "../config/env-sanitizer";
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
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: isTestEnvironment(),
      onsessioninitialized: (sid) => {
        LOGGER.debug("Session initialized with ID: ", sid);
        this.sessions.set(sid, {
          server: server,
          transport: transport,
        });
      },
    });

    transport.onclose = () => this.onCloseSession(transport);

    return transport;
  }

  /**
   * Gracefully terminates a session by session ID
   * Closes server and transport connections before removing from sessions map
   * @param sessionId - Unique identifier for the session to terminate
   * @returns Promise resolving to true if session was found and terminated, false otherwise
   */
  public async terminateSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      LOGGER.debug("Session not found for termination:", sessionId);
      return false;
    }

    try {
      LOGGER.debug("Terminating session:", sessionId);
      await session.transport.close();
      await session.server.close();
      this.sessions.delete(sessionId);
      LOGGER.debug("Session terminated successfully:", sessionId);
      return true;
    } catch (error) {
      LOGGER.error("Error terminating session:", sessionId, error);
      // Still remove from sessions map to prevent memory leaks
      this.sessions.delete(sessionId);
      return false;
    }
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

    LOGGER.debug("Session closed via transport:", transport.sessionId);
    this.sessions.delete(transport.sessionId);
  }
}
