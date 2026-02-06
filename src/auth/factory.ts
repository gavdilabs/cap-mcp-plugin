import {
  Request,
  Response,
  RequestHandler,
  ErrorRequestHandler,
} from "express";
import { XSUAAService } from "./xsuaa-service";
import { AuthTypes, useMockAuth } from "./utils";
import { LOGGER } from "../logger";
import { buildPublicBaseUrl } from "./host-resolver";

/** JSON-RPC 2.0 error code for unauthorized requests */
const RPC_UNAUTHORIZED = 10;

/* @ts-ignore */
const cds = global.cds || require("@sap/cds"); // This is a work around for missing cds context

/**
 * Sends a 401 response with RFC 9728 compliant WWW-Authenticate header.
 * The header includes `resource_metadata` pointing to the protected resource metadata endpoint.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param message - Error message for the JSON-RPC response
 */
function send401WithMetadata(
  req: Request,
  res: Response,
  message: string,
): void {
  const baseUrl = buildPublicBaseUrl(req);
  const metadataUrl = `${baseUrl}/.well-known/oauth-protected-resource`;

  res.set("WWW-Authenticate", `Bearer resource_metadata="${metadataUrl}"`);
  res.status(401).json({
    jsonrpc: "2.0",
    error: {
      code: RPC_UNAUTHORIZED,
      message,
      id: null,
    },
  });
}

/**
 * Creates an Express middleware for MCP authentication validation.
 *
 * This handler validates that requests are properly authenticated based on the CAP authentication
 * configuration. It checks for authorization headers (except for 'dummy' auth), validates the
 * CAP context, and ensures a valid user is present.
 *
 * The middleware performs the following validations:
 * 1. Checks for Authorization header (unless CAP auth is 'dummy')
 * 2. Validates that CAP context is properly initialized
 * 3. Ensures an authenticated user exists and is not anonymous
 *
 * @returns Express RequestHandler middleware function
 *
 * @example
 * ```typescript
 * const authMiddleware = authHandlerFactory();
 * app.use('/mcp', authMiddleware);
 * ```
 *
 * @throws {401} When authorization header is missing (non-dummy auth)
 * @throws {401} When user is not authenticated or is anonymous
 * @throws {500} When CAP context is not properly loaded
 */
export function authHandlerFactory(): RequestHandler {
  const authKind = cds.env.requires.auth.kind as AuthTypes;
  const xsuaaService = !useMockAuth(authKind) ? new XSUAAService() : undefined;

  LOGGER.debug("Authentication kind", authKind);

  return async (req, res, next) => {
    if (!req.headers.authorization && authKind !== "dummy") {
      send401WithMetadata(req, res, "Unauthorized");
      return;
    }

    // For XSUAA/JWT auth types, use @sap/xssec for validation
    if (
      (authKind === "jwt" || authKind === "xsuaa" || authKind === "ias") &&
      xsuaaService?.isConfigured()
    ) {
      const securityContext = await xsuaaService.createSecurityContext(req);

      if (!securityContext) {
        send401WithMetadata(req, res, "Invalid or expired token");
        return;
      }

      // Add security context to request for later use
      (req as any).securityContext = securityContext;
    }

    // Continue with existing CAP context validation
    const ctx = cds.context;
    if (!ctx) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal Error: Context not correctly loaded",
          id: null,
        },
      });
      return;
    }

    const user = ctx.user;
    if (!user || user === cds.User.anonymous) {
      send401WithMetadata(req, res, "Unauthorized");
      return;
    }

    return next();
  };
}

/**
 * Creates an Express error handling middleware for CAP authentication errors.
 *
 * This error handler catches authentication and authorization errors thrown by CAP
 * middleware and converts them to JSON-RPC 2.0 compliant error responses. It handles
 * both 401 (Unauthorized) and 403 (Forbidden) errors specifically.
 *
 * @returns Express ErrorRequestHandler middleware function
 *
 * @example
 * ```typescript
 * const errorHandler = errorHandlerFactory();
 * app.use('/mcp', errorHandler);
 * ```
 *
 * @param err - The error object, expected to be 401 or 403 for auth errors
 * @param req - Express request object (unused, marked with underscore)
 * @param res - Express response object for sending error responses
 * @param next - Express next function for passing unhandled errors
 */
export function errorHandlerFactory(): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (err === 401) {
      send401WithMetadata(req, res, "Unauthorized");
      return;
    }

    if (err === 403) {
      res.status(403).json({
        jsonrpc: "2.0",
        error: {
          code: RPC_UNAUTHORIZED,
          message: "Forbidden",
          id: null,
        },
      });
      return;
    }

    next(err);
  };
}
