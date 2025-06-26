import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export type McpParameters = Record<string, unknown>;

export interface McpSession {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

export interface McpResourceQueryParams {
  filter?: string;
  top?: string;
  select?: string;
  skip?: string;
  orderby?: string;
}
