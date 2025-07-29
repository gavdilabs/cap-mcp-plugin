import { User } from "@sap/cds";
import { Application } from "express";
import { authHandlerFactory, errorHandlerFactory } from "./handler";
import { McpAuthType } from "../config/types";

// The configuration of CAP can give any of the following kinds for auth:
// 'dummy' | 'mocked' | 'basic' | 'jwt' | 'xsuaa' | 'ias' | string
//
// The string kind indicates that is auth type of none or otherwise unusable
// These can be found by accessing the auth object through: cds.env.requires.auth.kind

/* @ts-ignore */
const cds = global.cds || require("@sap/cds"); // This is a work around for missing cds context

/**
 * Indicates whether auth is enabled for the plugin through the config and the associated CAP application
 */
export function isAuthEnabled(configEnabled: McpAuthType): boolean {
  if (configEnabled === "none") return false;
  return true; // For now this will always default to true, as we do not want to falsely give access
}

/**
 * Gets the access rights for the given transaction based on whether the MCP plugin is using auth.
 * In the case of auth not being enabled, it will default to a privileged access level.
 */
export function getAccessRights(authEnabled: boolean): User {
  return authEnabled ? cds.context.user : cds.User.privileged;
}

/**
 * Registers the middleware necessary to handle the authorization elements for the server
 */
export function registerAuthMiddleware(expressApp: Application): void {
  const middlewares = cds.middlewares.before as any[]; // No types exists for this part of the CDS library
  middlewares.forEach((mw) => {
    const process = mw.factory();
    if (!process || process.length <= 0) return;
    expressApp?.use("/mcp", process);
  });

  expressApp?.use("/mcp", errorHandlerFactory());
  expressApp?.use("/mcp", authHandlerFactory());
}
