import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

/**
 * Type definitions for MCP (Model Context Protocol) server implementation
 * Defines interfaces and types used throughout the MCP plugin
 */

/**
 * Parameters passed to MCP tools with flexible schema validation
 * Maps parameter names to their values, typically validated by Zod schemas
 */
export type McpParameters = Record<string, unknown>;

/**
 * Represents an active MCP session with transport and server instances
 * Each session maintains its own MCP server and HTTP transport connection
 */
export interface McpSession {
  /** HTTP transport handler for MCP communication protocol */
  transport: StreamableHTTPServerTransport;
  /** MCP server instance managing protocol methods (tools, resources, prompts) */
  server: McpServer;
}

/**
 * Entity operation modes supported by MCP entity tools
 * Defines the different CRUD-like operations available for entities
 */
export type EntityOperationMode =
  | "query"
  | "get"
  | "create"
  | "update"
  | "delete";

/**
 * OData v4 query parameters supported by MCP resources
 * All parameters are optional and passed as strings from HTTP requests
 */
export interface McpResourceQueryParams {
  /** OData $filter expression for filtering results (e.g., "name eq 'value'") */
  filter?: string;
  /** OData $top parameter for limiting number of results (e.g., "10") */
  top?: string;
  /** OData $select parameter for choosing specific properties (e.g., "name,id") */
  select?: string;
  /** OData $skip parameter for pagination offset (e.g., "20") */
  skip?: string;
  /** OData $orderby parameter for sorting results (e.g., "name asc") */
  orderby?: string;
  /** OData $expand parameter for expanding associations (e.g., "*" or "items,partners") */
  expand?: string;
}

/**
 * Structured query arguments used by entity wrapper tools (query mode)
 * Mirrors the validated Zod schema in entity-tools while being reusable across modules
 */
export type OrderDirection = "asc" | "desc";

export type AggregateFunction = "sum" | "avg" | "min" | "max" | "count";

export interface OrderByClause {
  field: string;
  dir: OrderDirection;
}

export type WhereOperator =
  | "eq"
  | "ne"
  | "gt"
  | "ge"
  | "lt"
  | "le"
  | "contains"
  | "startswith"
  | "endswith"
  | "in";

export interface WhereClause {
  field: string;
  op: WhereOperator;
  value: string | number | boolean | Array<string | number>;
}

export interface AggregateClause {
  field: string;
  fn: AggregateFunction;
}

export interface EntityListQueryArgs {
  top: number;
  skip: number;
  select?: string[];
  orderby?: OrderByClause[];
  where?: WhereClause[];
  q?: string;
  return?: "rows" | "count" | "aggregate";
  aggregate?: AggregateClause[];
  explain?: boolean;
  expand?: string | string[];
}

export interface McpResult {
  content: Array<any>;
  structuredContent?: Record<string, unknown>;
}
