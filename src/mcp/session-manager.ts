import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ParsedAnnotations } from "../annotations/types";
import { CAPConfiguration } from "../config/types";
import { McpSession } from "./types";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { isTestEnvironment } from "../config/env-sanitizer";
import { LOGGER } from "../logger";
import { createMcpServer } from "./factory";

export class McpSessionManager {
  private readonly sessions: Map<string, McpSession>;

  constructor() {
    this.sessions = new Map<string, McpSession>();
  }

  public getSessions(): Map<string, McpSession> {
    return this.sessions;
  }

  public hasSession(sessionID: string): boolean {
    return this.sessions.has(sessionID);
  }

  public getSession(sessionID: string): McpSession | undefined {
    return this.sessions.get(sessionID);
  }

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

  private onCloseSession(transport: StreamableHTTPServerTransport): void {
    if (!transport.sessionId || !this.sessions.has(transport.sessionId)) {
      return;
    }

    this.sessions.delete(transport.sessionId);
  }
}
