import { User } from "@sap/cds";
import express, { Application, Request, Response } from "express";
import helmet from "helmet";
import { McpRestriction } from "../annotations/types";
import { McpAuthType } from "../config/types";
import { LOGGER } from "../logger";
import { authHandlerFactory, errorHandlerFactory } from "./factory";
import { handleTokenRequest } from "./handlers";
import {
  buildPublicBaseUrl,
  resolveEffectiveHost,
  isLocalDevelopmentHost,
} from "./host-resolver";
import { AuthCredentials, XSUAAService } from "./xsuaa-service";

/**
 * Allowed custom URI schemes for OAuth redirection in IDE extensions/apps.
 *
 * NOTE: The MCP specification (2025-03-26 / 2025-11-25) mandates that redirect
 * URIs MUST be either localhost URLs or HTTPS URLs. Custom URI schemes are NOT
 * part of the MCP standard. This list exists as a pragmatic fallback per
 * RFC 8252 (OAuth 2.0 for Native Apps) in case a future client uses private-use
 * URI schemes instead of the spec-mandated localhost loopback redirect.
 *
 * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
 * @see https://datatracker.ietf.org/doc/html/rfc8252
 */
const ALLOWED_SCHEMES = [
  "cursor",
  "vscode",
  "claude",
  "code-insiders",
  "vscodium",
];

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
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
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
  code_verifier?: string;
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
export async function registerAuthMiddleware(
  expressApp: Application,
): Promise<void> {
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
  await configureOAuthProxy(expressApp);

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
async function configureOAuthProxy(expressApp: Application): Promise<void> {
  const config = cds.env.requires.auth;
  const kind = config.kind as AuthTypes;
  const credentials = config.credentials as AuthCredentials;

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

  await registerOAuthEndpoints(expressApp, credentials, kind);
}

/**
 * Resolves the tenant-specific XSUAA authentication URL from the incoming request context.
 *
 * In multi-tenant deployments, extracts the tenant subdomain from the request host.
 * In single-tenant deployments, uses the configured identity zone.
 * For local development, falls back to `identityzone` or `tenantid` from credentials.
 *
 * @param req - Express request containing tenant context (via host header)
 * @param credentials - XSUAA credentials from CAP configuration (must include uaadomain)
 * @param urlPath - The XSUAA endpoint path (e.g., "/oauth/authorize", "/oauth/token")
 * @returns Fully qualified tenant-specific XSUAA URL
 * @throws {Error} When uaadomain is missing from credentials
 *
 * @example
 * // Multi-tenant production
 * resolveTenantAuthUrl(req, creds, "/oauth/authorize")
 * // → "https://tenant-abc.authentication.eu10.hana.ondemand.com/oauth/authorize"
 *
 * // Local development
 * resolveTenantAuthUrl(req, creds, "/oauth/token")
 * // → "https://my-dev-zone.authentication.eu10.hana.ondemand.com/oauth/token"
 */
export function resolveTenantAuthUrl(
  req: Request,
  credentials: AuthCredentials,
  urlPath: string,
): string {
  const effectiveHost = resolveEffectiveHost(req);
  let subdomain = effectiveHost.split(".")[0];
  const originalSubdomain = subdomain;

  // Check if we're in local development
  const isLocalDev = isLocalDevelopmentHost(effectiveHost);
  if (isLocalDev) {
    subdomain = credentials.identityzone || credentials.tenantid || subdomain;
    LOGGER.debug(
      "[MCP-XSUAA] Local development detected - using identity zone as subdomain",
      {
        originalSubdomain,
        identityZone: subdomain,
        source: credentials.identityzone ? "identityzone" : "tenantid-fallback",
      },
    );
  }

  const domain = credentials.uaadomain;
  if (!domain) {
    throw new Error(
      `Missing required 'uaadomain' in XSUAA credentials. ` +
        `The uaadomain specifies your authentication domain (e.g., "authentication.eu10.hana.ondemand.com"). ` +
        `Verify your XSUAA service binding includes this property.`,
    );
  }

  const xsuaaUrl = `https://${subdomain}.${domain}${urlPath}`;

  LOGGER.info("[MCP-XSUAA] Built subscriber XSUAA URL", {
    xsuaaUrl,
    subdomain,
    domain,
    urlPath,
    isLocalDev,
  });

  return xsuaaUrl;
}

/**
 * Determines if a URI uses a custom scheme (not http/https).
 */
export function isCustomScheme(uri: string): boolean {
  return !!uri && !uri.startsWith("http://") && !uri.startsWith("https://");
}

/**
 * Validates if the custom scheme is in the allowed list and not a dangerous one.
 */
export function isValidCustomScheme(uri: string): boolean {
  if (!isCustomScheme(uri)) return false;
  if (/^(javascript|data|file|about):/i.test(uri)) return false;
  const match = uri.match(/^([a-z0-9-]+):/i);
  return !!match && ALLOWED_SCHEMES.includes(match[1].toLowerCase());
}

/**
 * Escapes HTML characters for safe rendering in status pages.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Encodes proxy state for custom scheme redirection.
 */
export function encodeProxyState(
  originalState: string,
  customUri: string,
): string {
  return Buffer.from(
    JSON.stringify({ s: originalState, r: customUri }),
  ).toString("base64url");
}

/**
 * Decodes proxy state to recover original state and custom redirect URI.
 */
export function decodeProxyState(
  state: any,
): { customUri: string; originalState: string } | null {
  if (!state || typeof state !== "string") return null;
  try {
    const d = JSON.parse(Buffer.from(state, "base64url").toString());
    return d.r ? { customUri: d.r, originalState: d.s } : null;
  } catch {
    return null;
  }
}

/**
 * Renders a fallback redirect page for custom scheme URIs.
 * Auto-redirects for all schemes in {@link ALLOWED_SCHEMES}.
 */
export function renderCustomSchemeRedirect(url: string): string {
  const safeUrl = escapeHtml(url);
  // Build JS condition from ALLOWED_SCHEMES so it stays in sync automatically
  const schemeChecks = ALLOWED_SCHEMES.map(
    (s) => `url.indexOf('${s}:')===0`,
  ).join("||");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Redirecting...</title></head>
<body style="font-family:system-ui;text-align:center;padding:50px" data-url="${safeUrl}">
<h2>Authorization Complete</h2>
<p><a href="${safeUrl}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:6px">Open Application</a></p>
<p style="font-size:12px;color:#666">Or copy: <code style="background:#f5f5f5;padding:4px 8px">${safeUrl}</code></p>
<script>
  (function() {
    var url = document.body.getAttribute('data-url');
    if (url && (${schemeChecks})) {
      location.href = url;
    }
  })();
</script>
</body></html>`;
}

/**
 * Registers OAuth endpoints for XSUAA integration
 * Only called for jwt/xsuaa/ias auth types with valid credentials
 */
export async function registerOAuthEndpoints(
  expressApp: Application,
  credentials: AuthCredentials,
  kind: AuthTypes,
): Promise<void> {
  const xsuaaService = new XSUAAService();

  // Fetch endpoints from OIDC configuration (awaited to ensure endpoints are ready)
  await xsuaaService.discoverOAuthEndpoints();

  // Add JSON and URL-encoded body parsing for OAuth endpoints
  expressApp.use("/oauth", express.json());
  expressApp.use("/oauth", express.urlencoded({ extended: true }));

  // Apply helmet security middleware only to OAuth routes
  expressApp.use(
    "/oauth",
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }),
  );

  // OAuth Authorization endpoint - stateless redirect to XSUAA
  expressApp.get("/oauth/authorize", (req: Request, res: Response): void => {
    const {
      state,
      redirect_uri,
      client_id,
      code_challenge,
      code_challenge_method,
      scope,
    } = req.query as AuthorizeQuery;

    // Client validation and redirect URI validation is handled by XSUAA
    // We delegate all client management to XSUAA's built-in OAuth server

    const baseUrl = buildPublicBaseUrl(req);
    LOGGER.debug("[MCP-OAUTH] Authorization request received", { baseUrl });

    let redirectUri = redirect_uri || `${baseUrl}/oauth/callback`;
    let proxyState = state;

    if (isCustomScheme(redirectUri)) {
      if (!isValidCustomScheme(redirectUri)) {
        LOGGER.warn("[MCP-OAUTH] Invalid custom scheme rejected", {
          scheme: redirectUri?.split(":")[0],
        });
        res.status(400).json({
          error: "invalid_request",
          error_description: "Invalid redirect URI scheme",
        });
        return;
      }
      LOGGER.warn(
        "[MCP-OAUTH] Custom scheme redirect URI received. " +
          "Note: MCP spec mandates localhost or HTTPS redirect URIs. " +
          "Custom schemes are supported as an RFC 8252 fallback.",
        { scheme: redirectUri.split(":")[0] },
      );
      proxyState = encodeProxyState(state || "", redirectUri);
      redirectUri = `${baseUrl}/oauth/callback`;
    }

    const params = new URLSearchParams({
      response_type: "code",
      redirect_uri: redirectUri,
      client_id: client_id ?? credentials.clientid,
    });
    if (code_challenge) params.set("code_challenge", code_challenge);
    if (code_challenge_method)
      params.set("code_challenge_method", code_challenge_method);
    if (scope) params.set("scope", scope);
    if (proxyState) params.set("state", proxyState);

    const xsuaaUrl = `${resolveTenantAuthUrl(req, credentials, "/oauth/authorize")}?${params}`;

    LOGGER.debug("[MCP-OAUTH] Redirecting to XSUAA", {
      subdomain: resolveEffectiveHost(req).split(".")[0],
    });

    res.redirect(xsuaaUrl);
  });

  // OAuth Callback endpoint
  expressApp.get(
    "/oauth/callback",
    async (req: Request, res: Response): Promise<void> => {
      const { code, state, error, error_description } =
        req.query as CallbackQuery;
      const proxy = decodeProxyState(state);

      LOGGER.debug("[MCP-OAUTH] Callback received from XSUAA", {
        hasCode: !!code,
        hasError: !!error,
        hasProxyState: !!proxy,
      });

      // Custom scheme: redirect back to client
      if (proxy) {
        if (!isValidCustomScheme(proxy.customUri)) {
          LOGGER.warn("[MCP-OAUTH] Invalid custom scheme in callback state", {
            scheme: proxy.customUri?.split(":")[0],
          });
          res.status(400).json({
            error: "invalid_request",
            error_description: "Invalid scheme",
          });
          return;
        }

        LOGGER.info("[MCP-OAUTH] Redirecting to custom scheme client", {
          scheme: proxy.customUri.split(":")[0],
          hasCode: !!code,
          hasError: !!error,
        });

        const params = new URLSearchParams();
        if (code) params.set("code", code);
        if (error) params.set("error", error);
        if (error_description)
          params.set("error_description", error_description);
        if (proxy.originalState) params.set("state", proxy.originalState);

        res.set({ "Cache-Control": "no-store", "X-Frame-Options": "DENY" });
        res.send(renderCustomSchemeRedirect(`${proxy.customUri}?${params}`));
        return;
      }

      if (error) {
        LOGGER.warn("[MCP-OAUTH] Authorization error from XSUAA", {
          error,
          errorDescription: error_description,
        });
        res.status(400).json({
          error: "authorization_failed",
          error_description: error_description || error,
        });
        return;
      }

      if (!code) {
        LOGGER.warn("[MCP-OAUTH] Callback missing authorization code");
        res.status(400).json({
          error: "invalid_request",
          error_description: "Missing code",
        });
        return;
      }

      LOGGER.warn(
        "[MCP-OAUTH] Invalid callback - no proxy state and no custom scheme handling",
      );
      res.status(400).json({
        error: "invalid_request",
        error_description: "Invalid callback",
      });
    },
  );

  // OAuth Token endpoint - POST (standard OAuth 2.0)
  expressApp.post(
    "/oauth/token",
    async (req: Request, res: Response): Promise<void> => {
      await handleTokenRequest(req, res, xsuaaService);
    },
  );

  expressApp.get(
    "/.well-known/oauth-authorization-server",
    (req: Request, res: Response): void => {
      const base = buildPublicBaseUrl(req);
      const issuer = resolveTenantAuthUrl(req, credentials, "");

      LOGGER.debug("[MCP-OAUTH] Authorization server metadata requested", {
        baseUrl: base,
        issuer,
      });

      res.json({
        issuer,
        authorization_endpoint: `${base}/oauth/authorize`,
        token_endpoint: `${base}/oauth/token`,
        registration_endpoint: `${base}/oauth/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: ["openid"],
        token_endpoint_auth_methods_supported: ["client_secret_post"],
        registration_endpoint_auth_methods_supported: ["client_secret_basic"],
      });
    },
  );

  // BUG: This element has been commented out as a part of a hotfix for authorization flows.
  // It should not be included again until further investigation has been done, but a patch will have to be released to remedy this.
  // This is likely related to the fact that most MCP clients do not include application/json as their preferred response time when authenticating,
  // causing issues when targeting SAP's XSUAA service, that will default to HTML.
  //
  // RFC 9728: OAuth 2.0 Protected Resource Metadata endpoint
  // expressApp.get(
  //   "/.well-known/oauth-protected-resource",
  //   (req: Request, res: Response): void => {
  //     const baseUrl = buildPublicBaseUrl(req);
  //
  //     res.json({
  //       resource: baseUrl,
  //       authorization_servers: [credentials.url],
  //       bearer_methods_supported: ["header"],
  //       resource_documentation: `${baseUrl}/mcp/health`,
  //     });
  //   },
  // );

  // OAuth Client Registration (GET)
  expressApp.get(
    "/oauth/register",
    async (req: Request, res: Response): Promise<void> => {
      const callback = `${buildPublicBaseUrl(req)}/oauth/callback`;
      LOGGER.debug("[MCP-OAUTH] Client registration discovery requested", {
        callback,
      });
      res.json({
        client_id: credentials.clientid,
        client_name: "MCP Server",
        redirect_uris: [callback],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      });
    },
  );

  // OAuth Client Registration (POST)
  expressApp.post(
    "/oauth/register",
    async (req: Request, res: Response): Promise<void> => {
      const callback = `${buildPublicBaseUrl(req)}/oauth/callback`;
      const requestedUris = req.body?.redirect_uris;
      LOGGER.debug("[MCP-OAUTH] Client registration POST received", {
        clientName: req.body?.client_name,
        requestedUris,
      });
      res.status(201).json({
        client_id: credentials.clientid,
        client_name: req.body?.client_name || "MCP Client",
        redirect_uris:
          Array.isArray(requestedUris) && requestedUris.length > 0
            ? requestedUris
            : [callback],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      });
    },
  );

  LOGGER.info("[MCP-OAUTH] OAuth endpoints registered successfully", {
    endpoints: [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-authorization-server",
      "/oauth/authorize",
      "/oauth/callback",
      "/oauth/token",
      "/oauth/register",
    ],
  });
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

/**
 * Utility method for checking whether auth used is mocked and not live
 * @returns boolean
 */
export function useMockAuth(authKind: AuthTypes): boolean {
  return authKind !== "jwt" && authKind !== "ias" && authKind !== "xsuaa";
}
