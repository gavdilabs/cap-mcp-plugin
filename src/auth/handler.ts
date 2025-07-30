import { RequestHandler, ErrorRequestHandler } from "express";

/** JSON-RPC 2.0 error code for unauthorized requests */
const RPC_UNAUTHORIZED = 10;

/* @ts-ignore */
const cds = global.cds || require("@sap/cds"); // This is a work around for missing cds context

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
  const authKind = cds.env.requires.auth.kind;

  return (req, res, next) => {
    if (!req.headers.authorization && authKind !== "dummy") {
      res.status(401).json({
        jsonrpc: "2.0",
        error: {
          code: RPC_UNAUTHORIZED,
          message: "Unauthorized",
          id: null,
        },
      });
      return;
    }

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
      res.status(401).json({
        jsonrpc: "2.0",
        error: {
          code: RPC_UNAUTHORIZED,
          message: "Unauthorized",
          id: null,
        },
      });
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
  return (err, _, res, next) => {
    if (err === 401 || err === 403) {
      res.status(err).json({
        jsonrpc: "2.0",
        error: {
          code: RPC_UNAUTHORIZED,
          message: err === 401 ? "Unauthorized" : "Forbidden",
          id: null,
        },
      });
      return;
    }

    next(err);
  };
}
