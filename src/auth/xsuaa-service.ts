import { Request } from "express";
import * as xssec from "@sap/xssec";
import { LOGGER } from "../logger";

/* @ts-ignore */
const cds = global.cds || require("@sap/cds");

/**
 * XSUAA credentials interface (from @sap/xssec)
 */
export interface XSUAACredentials {
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
export class XSUAAService {
  private readonly credentials: XSUAACredentials;
  private readonly xsuaaService: xssec.XsuaaService;

  constructor() {
    this.credentials = cds.env.requires.auth.credentials as XSUAACredentials;

    // Initialize XSUAA service from @sap/xssec
    this.xsuaaService = new xssec.XsuaaService(this.credentials);
  }

  isConfigured(): boolean {
    return !!(
      this.credentials?.clientid &&
      this.credentials?.clientsecret &&
      this.credentials?.url
    );
  }

  /**
   * Generates authorization URL using @sap/xssec
   */
  getAuthorizationUrl(redirectUri: string, state?: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.credentials.clientid,
      redirect_uri: redirectUri,
      // scope: "uaa.resource",
    });

    if (state) {
      params.append("state", state);
    }

    return `${this.credentials.url}/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for token using @sap/xssec
   */
  async exchangeCodeForToken(
    code: string,
    redirectUri: string,
  ): Promise<TokenResponse> {
    try {
      const tokenOptions = {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      };

      // Use direct XSUAA token endpoint for authorization code exchange
      const response = await fetch(`${this.credentials.url}/oauth/token`, {
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
      const response = await fetch(`${this.credentials.url}/oauth/token`, {
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
  ): Promise<xssec.SecurityContext<any, any> | null> {
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
   * Get XSUAA service instance for advanced operations
   */
  getXsuaaService(): xssec.XsuaaService {
    return this.xsuaaService;
  }
}
