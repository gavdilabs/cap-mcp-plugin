import { Request, Response } from "express";
import { XSUAAService, AuthCredentials } from "./xsuaa-service";
import { LOGGER } from "../logger";
import { resolveEffectiveHost } from "./host-resolver";

/* @ts-ignore */
const cds = global.cds || require("@sap/cds");

// ============================================================================
// Token Cache
// Allows same authorization code to be exchanged multiple times.
// Required because Claude.ai and mcp-remote both try to exchange the same code.
// ============================================================================

const tokenCache = new Map<string, { token: any; createdAt: number }>();
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// JWT Decoding (for logging only, no verification)
// ============================================================================

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
  } catch (e) {
    return null;
  }
}

// ============================================================================
// Exports for Testing
// ============================================================================

export interface SubdomainExtractionOptions {
  appName?: string;
  fallbackSubdomain?: string;
}

export interface SubdomainExtractionResult {
  subdomain: string;
  isLocalDev: boolean;
  wasStripped: boolean;
}

/**
 * Extract subscriber subdomain from effective host.
 * Exported for unit testing.
 *
 * @param effectiveHost - The host from x-forwarded-host or host header
 * @param options - Options
 * @param options.appName - App name to strip from subdomain (from XSAPPNAME)
 * @param options.fallbackSubdomain - Fallback subdomain for local dev
 * @returns Result with subdomain, isLocalDev, and wasStripped flags
 */
export function extractSubscriberSubdomain(
  effectiveHost: string,
  options: SubdomainExtractionOptions = {},
): SubdomainExtractionResult {
  const { appName, fallbackSubdomain = "localhost" } = options;

  // Remove port if present
  const hostWithoutPort = effectiveHost.split(":")[0];

  // Extract first part of hostname
  const firstPart = hostWithoutPort.split(".")[0];

  // Check if it's local development
  const isLocalDev =
    firstPart === "localhost" ||
    firstPart === "127" ||
    hostWithoutPort.startsWith("127.0.0.1");

  if (isLocalDev) {
    return {
      subdomain: fallbackSubdomain,
      isLocalDev: true,
      wasStripped: false,
    };
  }

  // Try to strip app prefix if appName is provided
  let subdomain = firstPart;
  let wasStripped = false;

  if (appName && firstPart.startsWith(appName + "-")) {
    const withoutPrefix = firstPart.substring(appName.length + 1);
    if (withoutPrefix) {
      subdomain = withoutPrefix;
      wasStripped = true;
    }
  }

  return { subdomain, isLocalDev: false, wasStripped };
}

/**
 * Build subscriber XSUAA token URL.
 * Exported for unit testing.
 *
 * @param subdomain - Subscriber subdomain
 * @param uaaDomain - UAA domain (e.g., "authentication.eu10.hana.ondemand.com")
 * @returns Full XSUAA token URL
 */
export function buildSubscriberXsuaaTokenUrl(
  subdomain: string,
  uaaDomain: string,
): string {
  return `https://${subdomain}.${uaaDomain}/oauth/token`;
}

// ============================================================================
// Subscriber XSUAA Token Exchange
// CRITICAL: For multi-tenant SaaS, the authorization code must be exchanged
// at the SUBSCRIBER's XSUAA, not the provider's. The code was issued by the
// subscriber's XSUAA and can only be redeemed there.
// ============================================================================

function getXsuaaCredentials(): AuthCredentials {
  return (
    cds.env.requires.auth?.credentials || cds.env.requires.xsuaa?.credentials
  );
}

function buildAuthHeader(): string {
  const creds = getXsuaaCredentials();
  return `Basic ${Buffer.from(`${creds?.clientid}:${creds?.clientsecret}`).toString("base64")}`;
}

/**
 * Builds the subscriber's XSUAA token URL based on the request host.
 * For multi-tenant apps, the subdomain in the approuter URL maps to the subscriber's XSUAA subdomain.
 */
function buildSubscriberTokenUrl(req: Request): string {
  const creds = getXsuaaCredentials();
  const effectiveHost = resolveEffectiveHost(req);
  let subdomain = effectiveHost.split(".")[0];

  // Handle local development (localhost doesn't have subdomains)
  const isLocalDev =
    subdomain.includes(":") ||
    subdomain === "localhost" ||
    subdomain.startsWith("127");
  if (isLocalDev) {
    subdomain = creds?.identityzone || creds?.zid || subdomain;
    LOGGER.debug("[MCP-TOKEN] Local dev detected, using identity zone", {
      subdomain,
    });
  }

  // For multi-tenant apps, strip app prefix from subdomain if present
  const appName = process.env.XSAPPNAME?.split("!")[0];
  if (appName && subdomain.startsWith(appName + "-")) {
    subdomain = subdomain.substring(appName.length + 1);
    LOGGER.debug("[MCP-TOKEN] Stripped app prefix from subdomain", {
      subdomain,
      appName,
    });
  }

  const domain = creds?.uaadomain || "authentication.eu10.hana.ondemand.com";
  const tokenUrl = `https://${subdomain}.${domain}/oauth/token`;

  LOGGER.debug("[MCP-TOKEN] Built subscriber XSUAA token URL", {
    tokenUrl,
    subdomain,
  });

  return tokenUrl;
}

async function exchangeCodeAtSubscriberXsuaa(
  req: Request,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
): Promise<any> {
  const tokenUrl = buildSubscriberTokenUrl(req);
  const authHeader = buildAuthHeader();

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  if (codeVerifier) params.set("code_verifier", codeVerifier);

  LOGGER.debug("[MCP-TOKEN] Exchanging auth code at subscriber XSUAA", {
    tokenUrl,
    redirectUri,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: authHeader,
    },
    body: params,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData: any;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { error: errorText };
    }
    LOGGER.error("[MCP-TOKEN] Auth code exchange failed", {
      status: response.status,
      error: errorData.error_description || errorData.error,
      tokenUrl,
    });
    throw new Error(
      `${response.status} ${errorData.error_description || errorData.error}`,
    );
  }

  const tokenData = await response.json();
  const claims = decodeJwtPayload(tokenData.access_token);

  LOGGER.info("[MCP-TOKEN] Auth code exchange successful", {
    zid: claims?.zid,
    zdn: claims?.ext_attr?.zdn,
    expiresIn: tokenData.expires_in,
  });

  return tokenData;
}

/**
 * Exchange a user token for an application-scoped token at the SUBSCRIBER's XSUAA.
 *
 * This function performs a jwt-bearer grant to exchange a user's access token for
 * a token with application-level scopes. The exchange MUST happen at the subscriber's
 * XSUAA because:
 *
 * 1. The input token was issued by the subscriber's XSUAA
 * 2. The provider's XSUAA doesn't trust the subscriber's XSUAA as an issuer
 * 3. Only the issuing XSUAA can perform jwt-bearer exchanges on its own tokens
 *
 * **Scope Handling**: We intentionally DO NOT specify the `scope` parameter.
 * The provider's xsappname (e.g., "mymediset-dev!t499687") contains a tenant-specific
 * ID that is invalid at the subscriber's XSUAA. By omitting scope, XSUAA automatically
 * derives appropriate scopes from:
 * - The assertion token's existing scopes
 * - The client's configured permissions at the subscriber's tenant
 *
 * @param req - Express request (used to derive subscriber subdomain)
 * @param tokenData - Initial token response from authorization code exchange
 * @returns Token response with application scopes
 */
async function exchangeForAppScopesAtSubscriber(
  req: Request,
  tokenData: any,
): Promise<any> {
  const tokenUrl = buildSubscriberTokenUrl(req);
  const authHeader = buildAuthHeader();
  const inputClaims = decodeJwtPayload(tokenData.access_token);

  const params = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    response_type: "token+id_token",
    assertion: tokenData.access_token,
  });
  // Scope is intentionally NOT set - see JSDoc above

  LOGGER.debug("[MCP-TOKEN] Exchanging for app scopes via jwt-bearer", {
    tokenUrl,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData: any;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { error: errorText };
    }
    LOGGER.error("[MCP-TOKEN] jwt-bearer exchange failed", {
      status: response.status,
      error: errorData.error_description || errorData.error,
      tokenUrl,
    });
    throw new Error(
      `Token exchange for scopes failed: ${response.status} ${errorData.error_description || errorData.error}.`,
    );
  }

  const scopedToken = await response.json();
  const claims = decodeJwtPayload(scopedToken.access_token);

  // Critical: Check if tenant context changed during exchange
  if (inputClaims?.zid !== claims?.zid) {
    LOGGER.error(
      "[MCP-TOKEN] CRITICAL: Tenant context changed during jwt-bearer exchange",
      {
        inputZid: inputClaims?.zid,
        inputZdn: inputClaims?.ext_attr?.zdn,
        outputZid: claims?.zid,
        outputZdn: claims?.ext_attr?.zdn,
        impact: "Destination lookups will fail",
      },
    );
  }

  LOGGER.info("[MCP-TOKEN] jwt-bearer exchange successful", {
    zid: claims?.zid,
    zdn: claims?.ext_attr?.zdn,
    expiresIn: scopedToken.expires_in,
  });

  return scopedToken;
}

// ============================================================================
// Authorization Code Grant Handler
// ============================================================================

async function handleAuthorizationCodeGrant(
  req: Request,
  res: Response,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
  xsuaaService?: XSUAAService,
): Promise<void> {
  // Check cache first (allows same code to work for Claude.ai AND mcp-remote)
  const cached = tokenCache.get(code);
  if (cached && Date.now() - cached.createdAt < TOKEN_CACHE_TTL_MS) {
    LOGGER.debug("[MCP-TOKEN] Returning cached token");
    res.json(cached.token);
    return;
  }

  // Step 1: Exchange code at SUBSCRIBER's XSUAA (CRITICAL for multi-tenant)
  const tokenData = await exchangeCodeAtSubscriberXsuaa(
    req,
    code,
    redirectUri,
    codeVerifier,
  );

  // Step 2: Exchange for app scopes via jwt-bearer grant at SUBSCRIBER's XSUAA
  const scopedToken = await exchangeForAppScopesAtSubscriber(req, tokenData);
  const scopedClaims = decodeJwtPayload(scopedToken.access_token);

  // Cache for subsequent exchange attempts
  tokenCache.set(code, { token: scopedToken, createdAt: Date.now() });

  LOGGER.info("[MCP-TOKEN] Token exchange complete", {
    zid: scopedClaims?.zid,
    zdn: scopedClaims?.ext_attr?.zdn,
    expiresIn: scopedToken.expires_in,
  });

  res.json(scopedToken);
}

// ============================================================================
// Main Token Request Handler
// ============================================================================

/**
 * OAuth token request handler
 * Handles both authorization_code and refresh_token grant types
 */
export async function handleTokenRequest(
  req: Request,
  res: Response,
  xsuaaService: XSUAAService,
): Promise<void> {
  try {
    const { grant_type, code, redirect_uri, refresh_token, code_verifier } = {
      ...req.query,
      ...req.body,
    };

    LOGGER.debug("[MCP-TOKEN] Token request received", {
      grantType: grant_type,
    });

    if (grant_type === "authorization_code") {
      if (!code || !redirect_uri) {
        LOGGER.warn("[MCP-TOKEN] Missing code or redirect_uri");
        res.status(400).json({
          error: "invalid_request",
          error_description: "Missing code or redirect_uri",
        });
        return;
      }
      await handleAuthorizationCodeGrant(
        req,
        res,
        code as string,
        redirect_uri as string,
        code_verifier as string | undefined,
        xsuaaService,
      );
      return;
    }

    if (grant_type === "refresh_token") {
      if (!refresh_token) {
        LOGGER.warn("[MCP-TOKEN] Missing refresh_token");
        res.status(400).json({
          error: "invalid_request",
          error_description: "Missing refresh_token",
        });
        return;
      }
      const refreshedToken = await xsuaaService.refreshAccessToken(
        refresh_token as string,
      );
      LOGGER.debug("[MCP-TOKEN] Token refresh successful");
      res.json(refreshedToken);
      return;
    }

    LOGGER.warn("[MCP-TOKEN] Unsupported grant type", {
      grantType: grant_type,
    });
    res.status(400).json({
      error: "unsupported_grant_type",
      error_description: "Only authorization_code and refresh_token supported",
    });
  } catch (error) {
    LOGGER.error("[MCP-TOKEN] Token exchange failed", {
      error: (error as Error)?.message,
    });
    res.status(400).json({
      error: "invalid_grant",
      error_description:
        error instanceof Error ? error.message : "Unknown error",
    });
  }
}
