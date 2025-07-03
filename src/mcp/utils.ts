import { McpResourceAnnotation } from "../annotations/structures";
import { MCP_SESSION_HEADER, NEW_LINE } from "./constants";
import { McpSession } from "./types";
import { Request, Response } from "express";
import { z } from "zod";

const ODATA_2_CDS_MAP = new Map<string, string>([
  ["eq", "="],
  ["lt", "<"],
  ["le", "<="],
  ["gt", ">"],
  ["ge", ">="],
  ["ne", "!="],
]);

/**
 * Takes in the string based type name of the CDS type found through CSN and converts it to zod type
 */
/**
 * Takes in the string based type name of the CDS type found through CSN and converts it to zod type
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
 * Session handler for MCP server.
 * Rejects or approves incoming requests based on existing MCP session header ID
 */
/**
 * Session handler for MCP server.
 * Rejects or approves incoming requests based on existing MCP session header ID
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

//  TODO: Write test cases for this entry
/**
 * @deprecated Use ODataQueryValidator.validateFilter() instead for secure parsing
 * Parses and converts OData filter string from URL encoding to CDS query syntax
 * @param filter - URL encoded OData filter string
 * @returns Decoded filter string with CDS operators
 */
export function parseODataFilterString(filter: string): string {
  let parsed = "" + filter; // We do not want to mutate the original

  for (const [k, v] of ODATA_2_CDS_MAP.entries()) {
    if (!parsed.includes(`%20${k}%20`)) continue;
    parsed = parsed.replaceAll(`%20${k}%20`, ` ${v} `);
  }

  return decodeURIComponent(parsed);
}
