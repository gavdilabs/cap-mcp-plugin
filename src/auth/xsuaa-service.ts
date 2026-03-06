import * as xssec from "@sap/xssec";
import { Request } from "express";
import { LOGGER } from "../logger";
import { resolveEffectiveHost, isLocalDevelopmentHost } from "./host-resolver";

/* @ts-ignore */
const cds = global.cds || require("@sap/cds");

/**
 * OAuth endpoints
 */
interface OAuthEndpoints {
  discovery_url: string;
  authorization_endpoint: string;
  token_endpoint: string;
}

/**
 * XSUAA credentials interface (from @sap/xssec)
 */
export interface AuthCredentials {
  clientid: string;
  clientsecret: string;
  url: string;
  uaadomain?: string;
  verificationkey?: string;
  identityzone?: string;
  tenantid?: string;
  xsappname?: string;
}

/**
 * OAuth token response from XSUAA
 */
export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  jti?: string;
}

/**
 * OAuth error response
 */
export interface OAuthErrorResponse {
  error: string;
  error_description?: string;
  error_uri?: string;
}

/**
 * XSUAA service using official @sap/xssec library
 * Leverages SAP's official authentication and validation mechanisms
 */
export class XSUAAService {
  private readonly credentials: {
    authProvider: AuthCredentials;
    xsuaa: AuthCredentials;
  };
  private readonly xsuaaService: xssec.XsuaaService;
  private endpoints: {
    authProvider: OAuthEndpoints;
    xsuaa: OAuthEndpoints;
  };

  constructor() {
    // In case of IAS, the final token conversion to get application scopes has to be done with XSUAA, so there will be 2 sets of credentials
    this.credentials = {
      authProvider: cds.env.requires.auth?.credentials,
      xsuaa:
        cds.env.requires.xsuaa?.credentials ||
        cds.env.requires.auth?.credentials,
    };

    // Set default endpoints in case OIDC discovery call fails
    this.endpoints = {
      authProvider: {
        discovery_url: `${this.credentials.authProvider?.url}/.well-known/openid-configuration`,
        authorization_endpoint: `${this.credentials.authProvider?.url}/oauth/authorize`,
        token_endpoint: `${this.credentials.authProvider?.url}/oauth/token`,
      },
      xsuaa: {
        discovery_url: `${this.credentials.xsuaa?.url}/.well-known/openid-configuration`,
        authorization_endpoint: `${this.credentials.xsuaa?.url}/oauth/authorize`,
        token_endpoint: `${this.credentials.xsuaa?.url}/oauth/token`,
      },
    };

    this.xsuaaService = new xssec.XsuaaService(this.credentials.xsuaa);
  }

  isConfigured(): boolean {
    return !!(
      this.credentials.authProvider?.clientid &&
      this.credentials.authProvider?.clientsecret &&
      this.credentials.authProvider?.url
    );
  }

  /**
   * Resolves the XSUAA token endpoint dynamically from the incoming request context.
   *
   * Derives the tenant subdomain from the request host (or `x-forwarded-host` behind
   * a reverse proxy) and constructs the matching XSUAA token URL. This ensures the
   * token exchange always targets the XSUAA instance that issued the authorization
   * code, regardless of whether the deployment is single-tenant or multi-tenant.
   *
   * In local development the host is typically `localhost`, so the subdomain is
   * resolved from the service binding credentials (`identityzone` / `tenantid`).
   *
   * @param req - Express request carrying the tenant context
   * @returns Fully-qualified XSUAA token endpoint URL for the current tenant
   */
  resolveTokenEndpoint(req: Request): string {
    const effectiveHost = resolveEffectiveHost(req);
    let subdomain = effectiveHost.split(".")[0];

    if (isLocalDevelopmentHost(effectiveHost)) {
      subdomain =
        this.credentials.authProvider?.identityzone ||
        this.credentials.authProvider?.tenantid ||
        subdomain;
    }

    const domain = this.credentials.authProvider?.uaadomain;
    if (!domain) {
      throw new Error(
        `Missing required 'uaadomain' in XSUAA credentials. ` +
          `The uaadomain specifies your authentication domain (e.g., "authentication.eu10.hana.ondemand.com"). ` +
          `Verify your XSUAA service binding includes this property.`,
      );
    }
    return `https://${subdomain}.${domain}/oauth/token`;
  }

  /**
   * Fetch oauth endpoints from the OIDC discovery endpoints from both XSUAA (and IAS).
   * If none found than the default will be used.
   */
  async discoverOAuthEndpoints(): Promise<void> {
    // Do discovery for both 'authProvider' and 'xsuaa' endpoint sets
    try {
      const endpointKeys = Object.keys(
        this.endpoints,
      ) as (keyof typeof this.endpoints)[];
      for (let key of endpointKeys) {
        const response = await fetch(this.endpoints[key].discovery_url, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });
        if (!response.ok) {
          const errorData = await response.json();
          LOGGER.warn(
            `OAuth endpoints fetch failed: ${response.status} ${errorData.error_description || errorData.error}. Continuing with default configuration.`,
          );
        } else {
          const oidcConfig = await response.json();
          this.endpoints[key].authorization_endpoint =
            oidcConfig.authorization_endpoint;
          this.endpoints[key].token_endpoint = oidcConfig.token_endpoint;
          LOGGER.debug(
            `OAuth endpoints for [${key}] set to:`,
            this.endpoints[key],
          );
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`OAuth endpoints fetch failed: ${String(error)}`);
    }
  }

  /**
   * Generates authorization URL for subscriber-based authentication
   * @param baseUrl - Subscriber's base URL (e.g., https://tenant.app.com)
   */
  getAuthorizationUrl(
    baseUrl: string,
    redirectUri: string,
    client_id: string,
    state?: string,
    code_challenge?: string,
    code_challenge_method?: string,
    scope?: string,
  ): string {
    const params = new URLSearchParams({
      response_type: "code",
      redirect_uri: redirectUri,
      // scope: "uaa.resource",
      client_id,
      ...(!!code_challenge ? { code_challenge } : {}),
      ...(!!code_challenge_method ? { code_challenge_method } : {}),
      ...(!!scope ? { scope } : {}),
    });

    if (state) {
      params.append("state", state);
    }

    // Use subscriber's base URL for authorization endpoint instead of provider XSUAA
    return `${baseUrl}/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for token.
   *
   * @param code - The authorization code from XSUAA
   * @param redirectUri - The redirect URI used during authorization
   * @param code_verifier - PKCE code verifier (optional)
   * @param tokenEndpoint - Override for the XSUAA token endpoint (typically
   *   obtained via {@link resolveTokenEndpoint}). Falls back to the configured
   *   (static) endpoint when omitted.
   */
  async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    code_verifier?: string,
    tokenEndpoint?: string,
  ): Promise<TokenResponse> {
    try {
      const endpoint =
        tokenEndpoint || this.endpoints.authProvider.token_endpoint;

      const tokenOptions = {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        ...(!!code_verifier ? { code_verifier } : {}),
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${this.credentials.authProvider?.clientid}:${this.credentials.authProvider?.clientsecret}`).toString("base64")}`,
        },
        body: new URLSearchParams(tokenOptions),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as OAuthErrorResponse;
        throw new Error(
          `Token exchange failed: ${response.status} ${errorData.error_description || errorData.error}`,
        );
      }

      return response.json() as Promise<TokenResponse>;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Token exchange failed: ${String(error)}`);
    }
  }

  /**
   * Exchange an access token for one that carries application-level scopes
   * (jwt-bearer grant).
   *
   * @param token - The token from the initial authorization code exchange
   * @param tokenEndpoint - Override for the XSUAA token endpoint (typically
   *   obtained via {@link resolveTokenEndpoint}). Falls back to the configured
   *   (static) endpoint when omitted.
   */
  async getApplicationScopes(
    token: TokenResponse,
    tokenEndpoint?: string,
  ): Promise<TokenResponse> {
    try {
      const endpoint = tokenEndpoint || this.endpoints.xsuaa.token_endpoint;

      const tokenOptions = {
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        reponse_type: "token+id_token",
        assertion: token.access_token,
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${this.credentials.xsuaa?.clientid}:${this.credentials.xsuaa?.clientsecret}`).toString("base64")}`,
        },
        body: new URLSearchParams(tokenOptions),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as OAuthErrorResponse;
        throw new Error(
          `Token exchange for scopes failed: ${response.status} ${errorData.error_description || errorData.error}`,
        );
      }

      return response.json() as Promise<TokenResponse>;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Token exchange for scopes failed: ${String(error)}`);
    }
  }

  /**
   * Refresh access token using @sap/xssec
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    try {
      const response = await fetch(this.endpoints.xsuaa.token_endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${this.credentials.xsuaa?.clientid}:${this.credentials.xsuaa?.clientsecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as OAuthErrorResponse;
        throw new Error(
          `Token refresh failed: ${response.status} ${errorData.error_description || errorData.error}`,
        );
      }

      return response.json() as Promise<TokenResponse>;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Token refresh failed: ${String(error)}`);
    }
  }

  /**
   * Validate JWT token using @sap/xssec SecurityContext
   * This is the proper way to validate tokens with XSUAA
   */
  async validateToken(accessToken: string, req?: Request): Promise<boolean> {
    try {
      // Create security context using @sap/xssec
      const securityContext = await xssec.createSecurityContext(
        this.xsuaaService,
        {
          req: req || { headers: { authorization: `Bearer ${accessToken}` } },
          token: accessToken as any,
        },
      );

      // If security context is created successfully, token is valid
      return !!securityContext;
    } catch (error) {
      // Log validation errors for debugging
      if (error instanceof xssec.errors.TokenValidationError) {
        LOGGER.warn("Token validation failed:", error.message);
      } else if (error instanceof Error) {
        LOGGER.warn("Token validation failed:", error.message);
      }
      return false;
    }
  }

  /**
   * Create security context for authenticated requests
   * Returns null if token is invalid
   */
  async createSecurityContext(
    req: Request,
  ): Promise<xssec.XsuaaSecurityContext | null> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return null;
      }

      const token = authHeader.substring(7);
      const securityContext = await xssec.createSecurityContext(
        this.xsuaaService,
        { req, token: token as any },
      );

      LOGGER.debug("[XSUAA] Security context created successfully");
      return securityContext;
    } catch (error: any) {
      LOGGER.error("[XSUAA] Security context creation failed", {
        error: error?.message,
      });
      return null;
    }
  }

  /**
   * Get XSUAA service instance for advanced operations
   */
  getXsuaaService(): xssec.XsuaaService {
    return this.xsuaaService;
  }

  /**
   * Get xsappname for role mapping
   */
  getXsappname(): string | undefined {
    return this.credentials.xsuaa?.xsappname;
  }
}
