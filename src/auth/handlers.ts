import { Request, Response } from "express";
import { XSUAAService } from "./xsuaa-service";
import { LOGGER } from "../logger";

/**
 * OAuth token request body/query parameters
 */
interface TokenRequestParams {
  grant_type?: "authorization_code" | "refresh_token";
  code?: string;
  redirect_uri?: string;
  refresh_token?: string;
  code_verifier: string;
}

/**
 * Reusable OAuth token handler function
 * Handles both GET and POST requests by extracting parameters from both query and body
 * This unified approach follows lemaiwo's successful pattern and works around MCP SDK inconsistencies
 */
export async function handleTokenRequest(
  req: Request,
  res: Response,
  xsuaaService: XSUAAService,
): Promise<void> {
  try {
    const params: TokenRequestParams = { ...req.query, ...req.body };
    const { grant_type, code, redirect_uri, refresh_token, code_verifier } =
      params;

    if (grant_type === "authorization_code") {
      if (!code || !redirect_uri) {
        res.status(400).json({
          error: "invalid_request",
          error_description: "Missing code or redirect_uri",
        });
        return;
      }

      const resolvedEndpoint = xsuaaService.resolveTokenEndpoint(req);
      const tokenData = await xsuaaService.exchangeCodeForToken(
        code,
        redirect_uri,
        code_verifier,
        resolvedEndpoint,
      );
      const scopedToken = await xsuaaService.getApplicationScopes(
        tokenData,
        resolvedEndpoint,
      );
      LOGGER.debug("Scopes in token:", scopedToken.scope);
      LOGGER.debug("[AUTH] Token exchange successful");
      res.json(scopedToken);
    } else if (grant_type === "refresh_token") {
      if (!refresh_token) {
        res.status(400).json({
          error: "invalid_request",
          error_description: "Missing refresh_token",
        });
        return;
      }

      const tokenData = await xsuaaService.refreshAccessToken(refresh_token);
      LOGGER.debug("[AUTH] Token refresh successful");
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
}
