import { User } from "@sap/cds";
import { Application } from "express";
import { authHandlerFactory, errorHandlerFactory } from "./handler";
import { McpAuthType } from "../config/types";

/**
 * @fileoverview Authentication utilities for MCP-CAP integration.
 *
 * This module provides utilities for integrating CAP authentication with MCP servers.
 * It supports all standard CAP authentication types and provides functions for:
 * - Determining authentication status
 * - Managing user access rights
 * - Registering authentication middleware
 *
 * Supported CAP authentication types:
 * - 'dummy': No authentication (privileged access)
 * - 'mocked': Mock users with predefined credentials
 * - 'basic': HTTP Basic Authentication
 * - 'jwt': Generic JWT token validation
 * - 'xsuaa': SAP BTP XSUAA OAuth2/JWT authentication
 * - 'ias': SAP Identity Authentication Service
 * - Custom string types for user-defined authentication strategies
 *
 * Access CAP auth configuration via: cds.env.requires.auth.kind
 */

/* @ts-ignore */
const cds = global.cds || require("@sap/cds"); // This is a work around for missing cds context

/**
 * Determines whether authentication is enabled for the MCP plugin.
 *
 * This function checks the plugin configuration to determine if authentication
 * should be enforced. When authentication is disabled ('none'), the plugin
 * operates with privileged access. For security reasons, this function defaults
 * to enabling authentication unless explicitly disabled.
 *
 * @param configEnabled - The MCP authentication configuration type
 * @returns true if authentication is enabled, false if disabled
 *
 * @example
 * ```typescript
 * const authEnabled = isAuthEnabled('inherit'); // true
 * const noAuth = isAuthEnabled('none');         // false
 * ```
 *
 * @since 1.0.0
 */
export function isAuthEnabled(configEnabled: McpAuthType): boolean {
  if (configEnabled === "none") return false;
  return true; // For now this will always default to true, as we do not want to falsely give access
}

/**
 * Retrieves the appropriate user context for CAP service operations.
 *
 * This function returns the correct user context based on whether authentication
 * is enabled. When authentication is enabled, it uses the current authenticated
 * user from the CAP context. When disabled, it provides privileged access.
 *
 * The returned User object is used for:
 * - Authorization checks in CAP services
 * - Audit logging and traceability
 * - Row-level security and data filtering
 *
 * @param authEnabled - Whether authentication is currently enabled
 * @returns CAP User object with appropriate access rights
 *
 * @example
 * ```typescript
 * const user = getAccessRights(true);  // Returns cds.context.user
 * const admin = getAccessRights(false); // Returns cds.User.privileged
 *
 * // Use in CAP service calls
 * const result = await service.tx({ user }).run(query);
 * ```
 *
 * @throws {Error} When authentication is enabled but no user context exists
 * @since 1.0.0
 */
export function getAccessRights(authEnabled: boolean): User {
  return authEnabled ? cds.context.user : cds.User.privileged;
}

/**
 * Registers comprehensive authentication middleware for MCP endpoints.
 *
 * This function sets up the complete authentication middleware chain for MCP endpoints.
 * It integrates with CAP's authentication system by:
 *
 * 1. Applying all CAP 'before' middleware (including auth middleware)
 * 2. Adding error handling for authentication failures
 * 3. Adding MCP-specific authentication validation
 *
 * The middleware chain handles all CAP authentication types automatically and
 * converts authentication errors to JSON-RPC 2.0 compliant responses.
 *
 * Middleware execution order:
 * 1. CAP middleware chain (authentication, logging, etc.)
 * 2. Authentication error handler
 * 3. MCP authentication validator
 *
 * @param expressApp - Express application instance to register middleware on
 *
 * @example
 * ```typescript
 * const app = express();
 * registerAuthMiddleware(app);
 *
 * // Now all /mcp routes are protected with CAP authentication
 * app.post('/mcp', mcpHandler);
 * ```
 *
 * @throws {Error} When CAP middleware chain is not properly initialized
 * @since 1.0.0
 */
export function registerAuthMiddleware(expressApp: Application): void {
  const middlewares = cds.middlewares.before as any[]; // No types exists for this part of the CDS library
  middlewares.forEach((mw) => {
    const process = mw.factory();
    if (!process || process.length <= 0) return;
    expressApp?.use("/mcp", process);
  });

  expressApp?.use("/mcp", errorHandlerFactory());
  expressApp?.use("/mcp", authHandlerFactory());
}
