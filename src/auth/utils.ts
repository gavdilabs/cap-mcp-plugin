import { User } from "@sap/cds";
import { Application, Request, Response } from "express";
import express from "express";
import { authHandlerFactory, errorHandlerFactory } from "./factory";
import { McpAuthType } from "../config/types";
import { McpRestriction } from "../annotations/types";
import { XSUAAService, XSUAACredentials } from "./xsuaa-service";
import { handleTokenRequest } from "./handlers";
import { LOGGER } from "../logger";

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
 * OAuth authorization request query parameters
 */
interface AuthorizeQuery {
  client_id?: string;
  state?: string;
  redirect_uri?: string;
}

/**
 * OAuth callback query parameters
 */
interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
  redirect_uri?: string;
}

/**
 * Union type representing all supported CAP authentication types.
 *
 * This type defines the complete set of authentication mechanisms supported
 * by the CAP framework and used in OAuth proxy configuration:
 *
 * - `dummy`: No authentication, allows all access (development only)
 * - `mocked`: Mock authentication with predefined test users
 * - `basic`: HTTP Basic Authentication with username/password
 * - `jwt`: Generic JWT token validation
 * - `xsuaa`: SAP BTP XSUAA OAuth2/JWT authentication service
 * - `ias`: SAP Identity Authentication Service
 *
 * @since 1.0.0
 */
export type AuthTypes = "dummy" | "mocked" | "basic" | "jwt" | "xsuaa" | "ias";

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

  // Build array of auth middleware to apply
  const authMiddleware: any[] = []; // Required any as a workaround for untyped cds middleware

  // Add CAP middleware
  middlewares.forEach((mw) => {
    const process = mw.factory();
    if (process && process.length > 0) {
      authMiddleware.push(process);
    }
  });

  // Add MCP auth middleware
  authMiddleware.push(errorHandlerFactory());
  authMiddleware.push(authHandlerFactory());

  // If we require OAuth then we should also apply for that
  configureOAuthProxy(expressApp);

  // Apply auth middleware to all /mcp routes EXCEPT health
  expressApp?.use(/^\/mcp(?!\/health).*/, ...authMiddleware);
}

/**
 * Configures OAuth proxy middleware for enterprise authentication scenarios.
 *
 * This function sets up a proxy OAuth provider that integrates with SAP BTP
 * authentication services (XSUAA/IAS) to enable MCP clients to authenticate
 * through standard OAuth2 flows. The proxy handles:
 *
 * - OAuth2 authorization and token endpoints
 * - Access token verification and validation
 * - Client credential management
 * - Integration with CAP authentication configuration
 *
 * The OAuth proxy is only configured for enterprise authentication types
 * (jwt, xsuaa, ias) and skips configuration for basic auth types.
 *
 * @param expressApp - Express application instance to register OAuth routes on
 *
 * @throws {Error} When required OAuth credentials are missing or invalid
 *
 * @example
 * ```typescript
 * // Automatically called by registerAuthMiddleware()
 * // Requires CAP auth configuration:
 * // cds.env.requires.auth = {
 * //   kind: 'xsuaa',
 * //   credentials: {
 * //     clientid: 'your-client-id',
 * //     clientsecret: 'your-client-secret',
 * //     url: 'https://your-tenant.authentication.sap.hana.ondemand.com'
 * //   }
 * // }
 * ```
 *
 * @internal This function is called internally by registerAuthMiddleware()
 * @since 1.0.0
 */
function configureOAuthProxy(expressApp: Application): void {
  const config = cds.env.requires.auth;
  const kind = config.kind as AuthTypes;
  const credentials = config.credentials as XSUAACredentials;

  // PRESERVE existing logic - skip OAuth proxy for basic auth types
  if (kind === "dummy" || kind === "mocked" || kind === "basic") return;

  // PRESERVE existing validation
  if (
    !credentials ||
    !credentials.clientid ||
    !credentials.clientsecret ||
    !credentials.url
  ) {
    throw new Error("Invalid security credentials");
  }

  registerOAuthEndpoints(expressApp, credentials);
}

/**
 * Determines the correct protocol (HTTP/HTTPS) for URL construction.
 * Accounts for reverse proxy headers and production environment defaults.
 *
 * @param req - Express request object
 * @returns Protocol string ('http' or 'https')
 */
function getProtocol(req: Request): string {
  // Check for reverse proxy header first (most reliable)
  if (req.headers["x-forwarded-proto"]) {
    return req.headers["x-forwarded-proto"] as string;
  }

  // Default to HTTPS in production environments
  const isProduction =
    process.env.NODE_ENV === "production" || process.env.VCAP_APPLICATION;
  return isProduction ? "https" : req.protocol;
}

/**
 * Registers OAuth endpoints for XSUAA integration
 * Only called for jwt/xsuaa/ias auth types with valid credentials
 */
function registerOAuthEndpoints(
  expressApp: Application,
  credentials: XSUAACredentials,
): void {
  const xsuaaService = new XSUAAService();

  // Add JSON and URL-encoded body parsing for OAuth endpoints
  expressApp.use("/oauth", express.json());
  expressApp.use("/oauth", express.urlencoded({ extended: true }));

  // OAuth Authorization endpoint - stateless redirect to XSUAA
  expressApp.get("/oauth/authorize", (req: Request, res: Response): void => {
    const { state, redirect_uri } = req.query as AuthorizeQuery;

    // Client validation and redirect URI validation is handled by XSUAA
    // We delegate all client management to XSUAA's built-in OAuth server

    const protocol = getProtocol(req);
    const redirectUri =
      redirect_uri || `${protocol}://${req.get("host")}/oauth/callback`;

    const authUrl = xsuaaService.getAuthorizationUrl(redirectUri, state);
    res.redirect(authUrl);
  });

  // OAuth Callback endpoint - stateless token exchange
  expressApp.get(
    "/oauth/callback",
    async (req: Request, res: Response): Promise<void> => {
      const { code, state, error, error_description, redirect_uri } =
        req.query as CallbackQuery;
      LOGGER.debug("[AUTH] Callback received", code, state);

      if (error) {
        res.status(400).json({
          error: "authorization_failed",
          error_description: error_description || error,
        });
        return;
      }

      if (!code) {
        res.status(400).json({
          error: "invalid_request",
          error_description: "Missing authorization code",
        });
        return;
      }

      try {
        const protocol = getProtocol(req);
        const url =
          redirect_uri || `${protocol}://${req.get("host")}/oauth/callback`;

        const tokenData = await xsuaaService.exchangeCodeForToken(code, url);

        res.json(tokenData);
      } catch (error) {
        LOGGER.error("OAuth callback error:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        res.status(400).json({
          error: "token_exchange_failed",
          error_description: errorMessage,
        });
      }
    },
  );

  // OAuth Token endpoint - POST (standard OAuth 2.0)
  expressApp.post(
    "/oauth/token",
    async (req: Request, res: Response): Promise<void> => {
      await handleTokenRequest(req, res, xsuaaService);
    },
  );

  // OAuth Discovery endpoint
  expressApp.get(
    "/.well-known/oauth-authorization-server",
    (req: Request, res: Response): void => {
      const protocol = getProtocol(req);
      const baseUrl = `${protocol}://${req.get("host")}`;

      res.json({
        issuer: credentials.url,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        registration_endpoint: `${baseUrl}/oauth/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        // scopes_supported: ["uaa.resource"],
        token_endpoint_auth_methods_supported: ["client_secret_post"],
        registration_endpoint_auth_methods_supported: ["client_secret_basic"],
      });
    },
  );

  // OAuth Dynamic Client Registration discovery endpoint (GET)
  expressApp.get(
    "/oauth/register",
    async (req: Request, res: Response): Promise<void> => {
      try {
        // Simple proxy for discovery - no CSRF needed
        const response = await fetch(`${credentials.url}/oauth/register`, {
          method: "GET",
          headers: {
            Authorization: `Basic ${Buffer.from(`${credentials.clientid}:${credentials.clientsecret}`).toString("base64")}`,
            Accept: "application/json",
          },
        });

        const xsuaaData = await response.json();

        // Add missing required fields that MCP client expects
        const protocol = getProtocol(req);
        const enhancedResponse = {
          ...xsuaaData, // Keep all XSUAA fields
          client_id: credentials.clientid, // Add our CAP app's client ID
          redirect_uris: [`${protocol}://${req.get("host")}/oauth/callback`], // Add our callback URL for discovery
        };

        res.status(response.status).json(enhancedResponse);
      } catch (error) {
        LOGGER.error("OAuth registration discovery error:", error);
        res.status(500).json({
          error: "server_error",
          error_description:
            error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // OAuth Dynamic Client Registration endpoint (POST) with CSRF handling
  expressApp.post(
    "/oauth/register",
    async (req: Request, res: Response): Promise<void> => {
      try {
        // Step 1: Fetch CSRF token from XSUAA
        const csrfResponse = await fetch(`${credentials.url}/oauth/register`, {
          method: "GET",
          headers: {
            "X-CSRF-Token": "Fetch",
            Authorization: `Basic ${Buffer.from(`${credentials.clientid}:${credentials.clientsecret}`).toString("base64")}`,
            Accept: "application/json",
          },
        });

        if (!csrfResponse.ok) {
          throw new Error(`CSRF fetch failed: ${csrfResponse.status}`);
        }

        // Step 2: Extract CSRF token and session cookie
        const setCookieHeader = csrfResponse.headers.get("set-cookie") || "";
        const csrfToken = extractCsrfFromCookie(setCookieHeader);

        if (!csrfToken) {
          throw new Error("Could not extract CSRF token from XSUAA response");
        }

        // Step 3: Make actual registration POST with CSRF token
        const registrationResponse = await fetch(
          `${credentials.url}/oauth/register`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrfToken,
              Cookie: setCookieHeader,
              Authorization: `Basic ${Buffer.from(`${credentials.clientid}:${credentials.clientsecret}`).toString("base64")}`,
              Accept: "application/json",
            },
            body: JSON.stringify(req.body),
          },
        );

        const xsuaaData = await registrationResponse.json();

        // Add missing required fields that MCP client expects
        const protocol = getProtocol(req);
        const enhancedResponse = {
          ...xsuaaData, // Keep all XSUAA fields
          client_id: credentials.clientid, // Add our CAP app's client ID
          client_secret: credentials.clientsecret, // CAP app's client secret
          redirect_uris: req.body.redirect_uris || [
            `${protocol}://${req.get("host")}/oauth/callback`,
          ], // Use client's redirect URIs
        };

        LOGGER.debug("[AUTH] Register POST response", enhancedResponse);

        res.status(registrationResponse.status).json(enhancedResponse);
      } catch (error) {
        LOGGER.error("OAuth registration error:", error);
        res.status(500).json({
          error: "server_error",
          error_description:
            error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  LOGGER.debug("OAuth endpoints registered for XSUAA integration");
}

/**
 * Extracts CSRF token from XSUAA Set-Cookie header
 * Looks for "X-Uaa-Csrf=<token>" pattern in the cookie string
 */
function extractCsrfFromCookie(setCookieHeader: string): string | null {
  if (!setCookieHeader) return null;

  // Match X-Uaa-Csrf=<token> pattern
  const csrfMatch = setCookieHeader.match(/X-Uaa-Csrf=([^;,]+)/i);
  return csrfMatch ? csrfMatch[1] : null;
}

/**
 * Checks whether the requesting user's access matches that of the roles required
 * @param user
 * @returns true if the user has access
 */
export function hasToolOperationAccess(
  user: User,
  roles: McpRestriction[],
): boolean {
  // If no restrictions are defined, allow access
  if (!roles || roles.length === 0) return true;

  for (const el of roles) {
    if (user.is(el.role)) return true;
  }
  return false;
}

/**
 * Access for resource annotation wraps object
 */
export interface WrapAccess {
  canRead?: boolean;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}

/**
 * Determines wrap accesses based on the given MCP restrictions derived from annotations
 * @param user
 * @param restrictions
 * @returns wrap tool accesses
 */
export function getWrapAccesses(
  user: User,
  restrictions: McpRestriction[],
): WrapAccess {
  // If no restrictions are defined, allow all access
  if (!restrictions || restrictions.length === 0) {
    return {
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
    };
  }

  const access: WrapAccess = {};

  for (const el of restrictions) {
    // If the user does not even have the role then no reason to check
    if (!user.is(el.role)) continue;

    if (!el.operations || el.operations.length <= 0) {
      access.canRead = true;
      access.canCreate = true;
      access.canDelete = true;
      access.canUpdate = true;
      break;
    }

    if (el.operations.includes("READ")) {
      access.canRead = true;
    }

    if (el.operations.includes("UPDATE")) {
      access.canUpdate = true;
    }

    if (el.operations.includes("CREATE")) {
      access.canCreate = true;
    }

    if (el.operations.includes("DELETE")) {
      access.canDelete = true;
    }
  }

  return access;
}
