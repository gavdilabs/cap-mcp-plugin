import { Request } from "express";
import * as xssec from "@sap/xssec";
import { LOGGER } from "../logger";
import { AuthTypes } from "./utils";

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
export class AuthService {
  private readonly credentials: AuthCredentials;
  private readonly authService: xssec.XsuaaService | xssec.IdentityService;
  private readonly kind: AuthTypes;
  private endpoints: OAuthEndpoints;

  constructor(kind: AuthTypes = "xsuaa") {
    this.credentials = cds.env.requires.auth.credentials as AuthCredentials;
    this.kind = kind;

    // Set default endpoints in case OIDC discovery call fails
    this.endpoints = {
      discovery_url: `${this.credentials?.url}/.well-known/openid-configuration`,
      authorization_endpoint: `${this.credentials?.url}/oauth/authorize`,
      token_endpoint: `${this.credentials?.url}/oauth/token`,
    };

    // Initialize XSUAA/IAS service from @sap/xssec
    if (this.kind === "ias") {
      this.authService = new xssec.IdentityService(this.credentials);
    } else {
      this.authService = new xssec.XsuaaService(this.credentials);
    }
  }

  isConfigured(): boolean {
    return !!(
      this.credentials?.clientid &&
      this.credentials?.clientsecret &&
      this.credentials?.url
    );
  }

  /**
   * Fetch oauth endpoints from the OIDC discovery endpoint.
   * If none found than the default will be used.
   */
  async discoverOAuthEndpoints(): Promise<void> {
    try {
      const response = await fetch(this.endpoints.discovery_url, {
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
        this.endpoints.authorization_endpoint =
          oidcConfig.authorization_endpoint;
        this.endpoints.token_endpoint = oidcConfig.token_endpoint;
        LOGGER.debug(`OAuth endpoints set to:`, this.endpoints);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`OAuth endpoints fetch failed: ${String(error)}`);
    }
  }

  /**
   * Generates authorization URL using @sap/xssec
   */
  async getAuthorizationUrl(
    redirectUri: string,
    client_id: string,
    state?: string,
    code_challenge?: string,
    code_challenge_method?: string,
    scope?: string,
  ): Promise<string> {
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

    return `${this.endpoints.authorization_endpoint}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for token using @sap/xssec
   */
  async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    code_verifier?: string,
  ): Promise<TokenResponse> {
    try {
      const tokenOptions = {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        ...(!!code_verifier ? { code_verifier } : {}),
      };

      // Use direct XSUAA/IAS token endpoint for authorization code exchange
      const response = await fetch(this.endpoints.token_endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${this.credentials.clientid}:${this.credentials.clientsecret}`).toString("base64")}`,
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
   * Refresh access token using @sap/xssec
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    try {
      const response = await fetch(this.endpoints.token_endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${this.credentials.clientid}:${this.credentials.clientsecret}`).toString("base64")}`,
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
        this.authService,
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
  ): Promise<xssec.SecurityContext<any, any> | null> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return null;
      }

      const token = authHeader.substring(7);
      const securityContext = await xssec.createSecurityContext(
        this.authService,
        { req, token: token as any },
      );

      return securityContext;
    } catch (error) {
      if (error instanceof xssec.errors.TokenValidationError) {
        LOGGER.warn("Security context creation failed:", error.message);
      } else if (error instanceof Error) {
        LOGGER.warn("Security context creation failed:", error.message);
      }
      return null;
    }
  }

  /**
   * Get XSUAA/IAS service instance for advanced operations
   */
  getAuthService(): xssec.XsuaaService | xssec.IdentityService {
    return this.authService;
  }
}
