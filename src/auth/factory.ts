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
  const xsuaaService = !useMockAuth(authKind)
    ? new XSUAAService(authKind)
    : undefined;

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

/** CAP pseudo-roles must never be granted via AMS policies (security); inlined from @sap/ams. */
const CAP_PSEUDO_ROLES = [
  "any",
  "authenticated-user",
  "internal-user",
  "system-user",
];

/**
 * Creates an Express middleware that applies @sap/ams (Authorization Management Service)
 * CAP authorizations to the MCP request chain.
 *
 * @sap/ams registers its CAP middleware via `cds.middlewares.add(..., { after: "auth" })`
 * inside a `cds.once("bootstrap")` handler, which fires AFTER the MCP plugin copies the CAP
 * 'before' middleware chain. As a result the AMS middleware is missed by that copy and must be
 * appended directly to the MCP chain. This factory mirrors @sap/ams' internal
 * `AmsCapMiddleware.handleRequest` using ONLY public exports (`amsCapPluginRuntime` +
 * `AMS_AUTHORIZATIONS`), avoiding a dependency on a private module path.
 *
 * For each authenticated (non-anonymous) request the middleware:
 * 1. Resolves the user's AMS authorizations for the current CAP context
 * 2. Stores them on the user via the `AMS_AUTHORIZATIONS` symbol
 * 3. Derives the user's non-pseudo AMS roles and exposes them through `user.is(...)`
 *
 * @returns An Express RequestHandler, or `undefined` when the @sap/ams CAP runtime is not
 *   available (in which case no AMS middleware should be applied).
 *
 * @example
 * ```typescript
 * const amsHandler = amsHandlerFactory();
 * if (amsHandler) authMiddleware.push(amsHandler);
 * ```
 */
export function amsHandlerFactory(): RequestHandler | undefined {
  // require() succeeding is not enough: @sap/ams only exports amsCapPluginRuntime when it could
  // load @sap/cds AND @sap/xssec at first require. Gate on the actual export we use.
  const ams = (() => {
    try {
      return require("@sap/ams");
    } catch {
      return null;
    }
  })();

  if (!ams?.amsCapPluginRuntime) {
    LOGGER.debug(
      "Skipping AMS CAP middleware: @sap/ams CAP runtime not available",
    );
    return undefined;
  }

  const { amsCapPluginRuntime, AMS_AUTHORIZATIONS } = ams;

  return async (_req, _res, next) => {
    try {
      const user = cds.context?.user;
      if (!user || user instanceof cds.User.Anonymous) return next();

      const authProvider = amsCapPluginRuntime.authProvider;
      if (!authProvider.supportsCdsContext(cds.context)) return next();

      const authorizations = await authProvider.getAuthorizations(cds.context);
      user[AMS_AUTHORIZATIONS] = authorizations;

      // Derive non-pseudo AMS roles and expose them via user.is (mirrors AmsCapMiddleware).
      const amsRoles = (
        Array.from(authorizations.getPotentialActions("$SCOPES")) as string[]
      ).filter((r) => !CAP_PSEUDO_ROLES.includes(r.toLowerCase()));

      const originalIs = user.is.bind(user);
      user.is = (role: string) => amsRoles.includes(role) || originalIs(role);
      user.amsRoles = amsRoles;

      return next();
    } catch (e) {
      return next(e);
    }
  };
}
