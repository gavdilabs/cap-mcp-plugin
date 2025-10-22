import { Request } from "express";
import * as xssec from "@sap/xssec";
import { LOGGER } from "../logger";

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

    return `${this.endpoints.authProvider.authorization_endpoint}?${params.toString()}`;
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
      const response = await fetch(this.endpoints.authProvider.token_endpoint, {
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
   * Convert access_token from authorization code into access_token with application scopes
   */
  async getApplicationScopes(token: TokenResponse): Promise<TokenResponse> {
    try {
      const tokenOptions = {
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        reponse_type: "token+id_token",
        assertion: token.access_token,
      };

      const response = await fetch(this.endpoints.xsuaa.token_endpoint, {
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
