/**
 * Host resolution for multi-tenant and reverse proxy scenarios.
 *
 * This module provides utilities to determine the correct public-facing host
 * when the application runs behind SAP Approuter or other reverse proxies.
 *
 * Header Priority (based on SAP Approuter documentation):
 * 1. x-forwarded-host - Standard header set by Approuter (setXForwardedHeaders=true, default)
 * 2. x-custom-host    - Only when EXTERNAL_REVERSE_PROXY=true
 * 3. APP_DOMAIN env   - Fallback for HTTP/2 bug where X-Forwarded headers may be missing
 * 4. host header      - Local development fallback
 *
 * @module host-resolver
 */

import { Request } from "express";
import { LOGGER } from "../logger";

/**
 * Environment configuration for host resolution.
 * Extracted to interface for testability.
 */
export interface HostResolverEnv {
  /** APP_DOMAIN environment variable */
  appDomain?: string;
  /** EXTERNAL_REVERSE_PROXY environment variable */
  externalReverseProxy?: boolean;
  /** NODE_ENV environment variable */
  nodeEnv?: string;
}

/**
 * Reads environment configuration for host resolution.
 * Separated for testability.
 */
export function getHostResolverEnv(): HostResolverEnv {
  return {
    appDomain: process.env.APP_DOMAIN,
    externalReverseProxy: process.env.EXTERNAL_REVERSE_PROXY === "true",
    nodeEnv: process.env.NODE_ENV,
  };
}

/**
 * Determines if the environment is production.
 * Production = NODE_ENV explicitly set to "production".
 */
export function isProductionEnv(env: HostResolverEnv): boolean {
  return env.nodeEnv === "production";
}

/**
 * Extracts subdomain from a hostname.
 * For "tenant1.myapp.cloud", returns "tenant1".
 * For "myapp.cloud" or "localhost", returns "".
 */
export function extractSubdomain(host: string, appDomain?: string): string {
  if (!host || !appDomain) return "";

  // Normalize: remove port, lowercase
  const cleanHost = host.split(":")[0].toLowerCase();
  const cleanDomain = appDomain.toLowerCase();

  if (cleanHost.endsWith(`.${cleanDomain}`)) {
    return cleanHost.slice(0, -(cleanDomain.length + 1));
  }

  return "";
}

/**
 * Determines if a host indicates local development.
 * Combines environment check (NODE_ENV) with host pattern matching.
 *
 * @param host - The host string to check (e.g., "localhost:4004", "127.0.0.1")
 * @param env - Environment configuration (optional)
 * @returns true if the host represents local development
 */
export function isLocalDevelopmentHost(
  host: string,
  env: HostResolverEnv = getHostResolverEnv(),
): boolean {
  // In production, never treat as local dev (even if host looks like localhost)
  if (isProductionEnv(env)) {
    return false;
  }

  // In non-production, check host patterns
  const cleanHost = (host || "").split(".")[0].toLowerCase();

  return (
    cleanHost.includes(":") || // localhost:4004, 127.0.0.1:3000
    cleanHost === "localhost" || // localhost
    cleanHost.startsWith("127") || // 127.0.0.1, 127.0.0.2
    cleanHost === "0" || // 0.0.0.0
    cleanHost.startsWith("[") || // [::1] (IPv6 localhost)
    cleanHost === "host" // host.docker.internal
  );
}

/**
 * Safely gets the host header from request.
 * Handles cases where req.get might not be available (e.g., in tests).
 */
function getHostHeader(req: Request): string {
  if (typeof req.get === "function") {
    return req.get("host") || "";
  }
  return (req.headers?.host as string) || "";
}

/**
 * Normalizes a host header value.
 * - Takes first value if comma-separated (proxy chain)
 * - Trims whitespace
 */
export function normalizeHost(headerValue: string | undefined): string {
  if (!headerValue) return "";

  // Take first host if comma-separated (multiple proxies)
  return headerValue.split(",")[0].trim();
}

/**
 * Resolves the effective public-facing host for the current request.
 *
 * @param req - Express request object
 * @param env - Environment configuration (optional, uses process.env by default)
 * @returns The resolved public host (without protocol)
 */
export function resolveEffectiveHost(
  req: Request,
  env: HostResolverEnv = getHostResolverEnv(),
): string {
  const isProduction = isProductionEnv(env);

  // Priority 1: x-forwarded-host (SAP Approuter standard)
  const xfh = normalizeHost(req.headers["x-forwarded-host"] as string);
  if (xfh) {
    LOGGER.debug("[host-resolver] using x-forwarded-host", { host: xfh });
    return xfh;
  }

  // Priority 2: x-custom-host (only with EXTERNAL_REVERSE_PROXY)
  if (env.externalReverseProxy) {
    const xch = normalizeHost(req.headers["x-custom-host"] as string);
    if (xch) {
      LOGGER.debug("[host-resolver] using x-custom-host", { host: xch });
      return xch;
    }
  }

  // Priority 3: APP_DOMAIN fallback (production only)
  if (env.appDomain && isProduction) {
    LOGGER.info("[host-resolver] using APP_DOMAIN fallback", {
      host: env.appDomain,
    });
    return env.appDomain;
  }

  // Priority 4: Raw host header
  const host = normalizeHost(getHostHeader(req)) || "localhost";
  if (isProduction) {
    LOGGER.warn("[host-resolver] using raw host in production", { host });
  }
  return host;
}

/**
 * Determines the protocol (http/https) for URL construction.
 *
 * @param req - Express request object
 * @param env - Environment configuration (optional)
 * @returns Protocol string ('http' or 'https')
 */
export function getProtocol(
  req: Request,
  env: HostResolverEnv = getHostResolverEnv(),
): string {
  // Check x-forwarded-proto first (most reliable behind proxy)
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (forwardedProto) {
    // Take first value if comma-separated
    return (forwardedProto as string).split(",")[0].trim();
  }

  // Default to HTTPS in production
  return isProductionEnv(env) ? "https" : req.protocol;
}

/**
 * Builds the complete public base URL for the current request.
 * Combines protocol and resolved host.
 *
 * @param req - Express request object
 * @param env - Environment configuration (optional)
 * @returns Full base URL (e.g., "https://tenant1.myapp.cloud")
 */
export function buildPublicBaseUrl(
  req: Request,
  env: HostResolverEnv = getHostResolverEnv(),
): string {
  const protocol = getProtocol(req, env);
  const host = resolveEffectiveHost(req, env);
  return `${protocol}://${host}`;
}
