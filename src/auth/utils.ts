import { User } from "@sap/cds";
import { Application, Request, Response } from "express";
import { authHandlerFactory, errorHandlerFactory } from "./handler";
import { McpAuthType } from "../config/types";
import { McpRestriction } from "../annotations/types";
import { XSUAAService, XSUAACredentials } from "./xsuaa-service";
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
 * OAuth token request body
 */
interface TokenRequestBody {
  grant_type: "authorization_code" | "refresh_token";
  code?: string;
  redirect_uri?: string;
  refresh_token?: string;
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
  const authMiddleware: any[] = [];

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

  // Apply auth middleware to all /mcp routes EXCEPT health
  expressApp?.use(/^\/mcp(?!\/health).*/, ...authMiddleware);

  // Then finally we add the oauth proxy to the xsuaa instance
  configureOAuthProxy(expressApp);
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

  // REPLACE broken mcpAuthMetadataRouter with working OAuth endpoints
  registerOAuthEndpoints(expressApp, credentials);
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

  // OAuth Authorization endpoint - stateless redirect to XSUAA
  expressApp.get(
    "/oauth/authorize",
    (req: Request<{}, {}, {}, AuthorizeQuery>, res: Response): void => {
      const { state, redirect_uri } = req.query;
      const redirectUri =
        redirect_uri || `${req.protocol}://${req.get("host")}/oauth/callback`;

      const authUrl = xsuaaService.getAuthorizationUrl(redirectUri, state);
      res.redirect(authUrl);
    },
  );

  // OAuth Callback endpoint - stateless token exchange
  expressApp.get(
    "/oauth/callback",
    async (
      req: Request<{}, {}, {}, CallbackQuery>,
      res: Response,
    ): Promise<void> => {
      const { code, state, error, error_description } = req.query;

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
        const redirectUri =
          req.query.redirect_uri ||
          `${req.protocol}://${req.get("host")}/oauth/callback`;
        const tokenData = await xsuaaService.exchangeCodeForToken(
          code,
          redirectUri,
        );

        const tokenDataJson = JSON.stringify(tokenData).replace(/"/g, "&quot;");
        const stateValue = (state || "").replace(/"/g, "&quot;");

        const html = `
        <html>
          <body>
            <h1>Authorization Successful</h1>
            <p>You can now close this window and return to your MCP client.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({
                  type: 'oauth_success',
                  tokens: ${tokenDataJson},
                  state: '${stateValue}'
                }, '*');
              }
              window.close();
            </script>
          </body>
        </html>
      `;

        res.setHeader("Content-Type", "text/html");
        res.send(html);
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

  // OAuth Token endpoint - proxy to XSUAA
  expressApp.post(
    "/oauth/token",
    async (
      req: Request<{}, {}, TokenRequestBody>,
      res: Response,
    ): Promise<void> => {
      const { grant_type, code, redirect_uri, refresh_token } = req.body;

      try {
        if (grant_type === "authorization_code") {
          if (!code || !redirect_uri) {
            res.status(400).json({
              error: "invalid_request",
              error_description: "Missing code or redirect_uri",
            });
            return;
          }
          const tokenData = await xsuaaService.exchangeCodeForToken(
            code,
            redirect_uri,
          );
          res.json(tokenData);
        } else if (grant_type === "refresh_token") {
          if (!refresh_token) {
            res.status(400).json({
              error: "invalid_request",
              error_description: "Missing refresh_token",
            });
            return;
          }
          const tokenData =
            await xsuaaService.refreshAccessToken(refresh_token);
          res.json(tokenData);
        } else {
          res.status(400).json({
            error: "unsupported_grant_type",
            error_description:
              "Only authorization_code and refresh_token are supported",
          });
        }
      } catch (error) {
        LOGGER.error("OAuth token error:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        res.status(400).json({
          error: "invalid_grant",
          error_description: errorMessage,
        });
      }
    },
  );

  // OAuth Discovery endpoint
  expressApp.get(
    "/.well-known/oauth-authorization-server",
    (req: Request, res: Response): void => {
      const baseUrl = `${req.protocol}://${req.get("host")}`;

      res.json({
        issuer: credentials.url,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        registration_endpoint: `${baseUrl}/oauth/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: ["uaa.resource"],
        token_endpoint_auth_methods_supported: [
          "client_secret_basic",
          "client_secret_post",
        ],
        registration_endpoint_auth_methods_supported: ["client_secret_basic"],
      });
    },
  );

  LOGGER.debug("OAuth endpoints registered for XSUAA integration");
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
