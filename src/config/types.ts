/* ======================================
 * How it will look in the .cdsrc or package.json
 * "cds": {
 *  ...
 *    "mcp": {
 *      "name": "my-mcp-server", // This is optional - otherwise grabbed from package.json name
 *      "version": "1.0.0", // Optional, otherwise grabbed from package.json version
 *      "auth": "inherit", // By default this will inherit auth from CAP, otherwise values can be 'inherit'|'api-key'|'none'
 *      "capabilities": {
 *        "resources": {
 *          "listChanged": true, // If not provided - default value = true
 *          "subscribe": true, // If not provided - default value = false
 *        },
 *        "tools": {
 *          "listChanged": true // If not provided - default value = true
 *        },
 *        "prompts": {
 *          "listChanged": true // If not provided - default value = true
 *        }
 *      }
 *    },
 *  ...
 * }
 * ======================================
 */

import { EntityOperationMode } from "../mcp/types";

/**
 * Configuration object which can be configured from the project's package.json or cdsrc
 * Is used both at parsing but also at runtime to pass along the configuration
 */
export interface CAPConfiguration {
  name: string;
  version: string;
  auth: McpAuthType;
  capabilities: {
    tools: ToolsConfiguration;
    resources: ResourcesConfiguration;
    prompts: PromptsConfiguration;
  };
  /**
   * Global switch to expose CAP entities (annotated as resources) as MCP tools as well.
   * Default: false (opt-in).
   */
  wrap_entities_to_actions?: boolean;
  /**
   * Default tool modes to register when wrapping entities. Can be overridden per-entity via @mcp.wrap.modes
   * Default: ['query','get']
   */
  wrap_entity_modes?: EntityOperationMode[];
  /**
   * Instructions for the MCP server
   */
  instructions?: string;
}

/**
 * Shared definition between the different protocol elements.
 * Used for easily having shared properties between configuration protocols.
 */
export interface ProtocolConfiguration {
  listChanged?: boolean;
}

/**
 * Tools configuration section for package.json/.cdsrc
 */
export interface ToolsConfiguration extends ProtocolConfiguration {}

/**
 * Resources configuration section for package.json/.cdsrc
 */
export interface ResourcesConfiguration extends ProtocolConfiguration {
  subscribe?: boolean;
}

/**
 * Prompts configuration section for package.json/.cdsrc
 */
export interface PromptsConfiguration extends ProtocolConfiguration {}

/**
 * Auth types available through the package.json/.cdsrc config
 */
export type McpAuthType = "inherit" | "none";

/**
 * Package.json mapping for vital app info
 */
export interface ProjectInfo {
  name: string;
  version: string;
}
