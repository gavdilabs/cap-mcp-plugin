import { McpResourceAnnotation } from "../annotations/structures";
import { MCP_SESSION_HEADER, NEW_LINE } from "./constants";
import { McpSession } from "./types";
import { Request, Response } from "express";
import { z } from "zod";

/**
 * Converts a CDS type string to the corresponding Zod schema type
 * @param cdsType - The CDS type name (e.g., 'String', 'Integer')
 * @returns Zod schema instance for the given type
 */
export function determineMcpParameterType(cdsType: string): unknown {
  switch (cdsType) {
    case "String":
      return z.string();
    case "Integer":
      return z.number();
    default:
      return z.string();
  }
}

/**
 * Handles incoming MCP session requests by validating session IDs and routing to appropriate session
 * @param req - Express request object containing session headers
 * @param res - Express response object for sending responses
 * @param sessions - Map of active MCP sessions keyed by session ID
 */
export async function handleMcpSessionRequest(
  req: Request,
  res: Response,
  sessions: Map<string, McpSession>,
) {
  const sessionIdHeader = req.headers[MCP_SESSION_HEADER] as string;
  if (!sessionIdHeader || !sessions.has(sessionIdHeader)) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  const session = sessions.get(sessionIdHeader);
  if (!session) {
    res.status(400).send("Invalid session");
    return;
  }

  await session.transport.handleRequest(req, res);
}

/**
 * Writes a detailed OData description for a resource including available query parameters and properties
 * @param model - The resource annotation to generate description for
 * @returns Formatted description string with OData query syntax examples
 */
export function writeODataDescriptionForResource(
  model: McpResourceAnnotation,
): string {
  let description = `${model.description}.${NEW_LINE}`;
  description += `Should be queried using OData v4 query style using the following allowed parameters.${NEW_LINE}`;
  description += `Parameters: ${NEW_LINE}`;

  if (model.functionalities.has("filter")) {
    description += `- filter: OData $filter syntax (e.g., "$filter=author_name eq 'Stephen King'")${NEW_LINE}`;
  }

  if (model.functionalities.has("top")) {
    description += `- top: OData $top syntax (e.g., $top=10)${NEW_LINE}`;
  }

  if (model.functionalities.has("skip")) {
    description += `- skip: OData $skip syntax (e.g., $skip=10)${NEW_LINE}`;
  }

  if (model.functionalities.has("select")) {
    description += `- select: OData $select syntax (e.g., $select=property1,property2, etc..)${NEW_LINE}`;
  }

  if (model.functionalities.has("orderby")) {
    description += `- orderby: OData $orderby syntax (e.g., "$orderby=property1 asc", or "$orderby=property1 desc")${NEW_LINE}`;
  }

  description += `${NEW_LINE}Available properties on ${model.target}: ${NEW_LINE}`;
  for (const [key, type] of model.properties.entries()) {
    description += `- ${key} -> value type = ${type} ${NEW_LINE}`;
  }

  return description;
}

/**
 * Unified MCP tool error response helper
 * Returns a consistent JSON error payload inside MCP content
 */
export function toolError(
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): any {
  const payload = { error: code, message, ...(extra || {}) };
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(payload),
      } as any,
    ],
  };
}

/**
 * Formats a payload as MCP result content with a single text part.
 * This ensures compatibility with all MCP clients.
 */
export function asMcpResult(payload: unknown): {
  content: Array<any>;
  structuredContent?: Record<string, unknown>;
} {
  // Pretty-print for objects, stringify primitives, and split arrays into multiple parts
  const toText = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (value === undefined) return "undefined";
    try {
      if (value !== null && typeof value === "object") {
        return JSON.stringify(value, null, 2);
      }
      return String(value);
    } catch {
      // Circular structures fall back to default string conversion
      return String(value);
    }
  };

  if (Array.isArray(payload)) {
    if (payload.length === 0) return { content: [] };
    return {
      content: payload.map(
        (item) => ({ type: "text", text: toText(item) }) as any,
      ),
    };
  }

  return {
    content: [
      {
        type: "text",
        text: toText(payload),
      } as any,
    ],
  };
}
