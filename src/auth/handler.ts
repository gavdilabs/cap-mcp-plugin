import { RequestHandler, ErrorRequestHandler } from "express";

const RPC_UNAUTHORIZED = 10;

/* @ts-ignore */
const cds = global.cds || require("@sap/cds"); // This is a work around for missing cds context

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
