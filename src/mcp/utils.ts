import { csn } from "@sap/cds";
import { McpResourceAnnotation } from "../annotations/structures";
import { MCP_SESSION_HEADER, NEW_LINE } from "./constants";
import { McpSession } from "./types";
import { Request, Response } from "express";
import { z } from "zod";

/* @ts-ignore */
const cds = global.cds || require("@sap/cds"); // This is a work around for missing cds context

/**
 * Converts a CDS type string to the corresponding Zod schema type
 * @param cdsType - The CDS type name (e.g., 'String', 'Integer')
 * @returns Zod schema instance for the given type
 */
export function determineMcpParameterType(
  cdsType: string,
  key?: string,
  target?: string,
): z.ZodType {
  switch (cdsType) {
    case "String":
      return z.string();
    case "UUID":
      return z.string();
    case "Date":
      return z.coerce.date();
    case "Time":
      return z.coerce.date();
    case "DateTime":
      return z.coerce.date();
    case "Timestamp":
      return z.coerce.date();
    case "Integer":
      return z.number().int();
    case "Int16":
      return z.number().int();
    case "Int32":
      return z.number().int();
    case "Int64":
      return z.union([z.string(), z.number().int()]).transform(String);
    case "UInt8":
      return z.number().int().min(0);
    case "Decimal":
      return z.union([z.string(), z.number()]).transform(String);
    case "Double":
      return z.number();
    case "Boolean":
      return z.boolean();
    case "Binary":
      return z.string();
    case "LargeBinary":
      return z.string();
    case "LargeString":
      return z.string();
    case "Map":
      return z.object({});
    case "StringArray":
      return z.array(z.string());
    case "DateArray":
      return z.array(z.coerce.date());
    case "TimeArray":
      return z.array(z.coerce.date());
    case "DateTimeArray":
      return z.array(z.coerce.date());
    case "TimestampArray":
      return z.array(z.coerce.date());
    case "UUIDArray":
      return z.array(z.string());
    case "IntegerArray":
      return z.array(z.number().int());
    case "Int16Array":
      return z.array(z.number().int());
    case "Int32Array":
      return z.array(z.number().int());
    case "Int64Array":
      return z.array(z.union([z.string(), z.number().int()]).transform(String));
    case "UInt8Array":
      return z.array(z.number().int().min(0));
    case "DecimalArray":
      return z.array(z.union([z.string(), z.number()]).transform(String));
    case "BooleanArray":
      return z.array(z.boolean());
    case "DoubleArray":
      return z.array(z.number());
    case "BinaryArray":
      return z.array(z.string());
    case "LargeBinaryArray":
      return z.array(z.string());
    case "LargeStringArray":
      return z.array(z.string());
    case "MapArray":
      return z.array(z.object({}));
    case "Composition":
      return buildCompositionZodType(key, target);
    default:
      return z.string();
  }
}

/**
 * Builds the complex ZodType for a CDS type of 'Composition'
 * @param key
 * @param target
 * @returns ZodType
 */
function buildCompositionZodType(
  key: string | undefined,
  target: string | undefined,
): z.ZodType {
  const model = cds.model as csn.CSN;

  if (!model.definitions || !target || !key) {
    return z.object({}); // fallback, might have to reconsider type later
  }

  const targetDef = model.definitions[target];
  const targetProp = targetDef.elements[key];
  const comp = model.definitions[targetProp.target];
  if (!comp) {
    return z.object({});
  }

  const isArray = targetProp.cardinality !== undefined;
  const compProperties: Map<string, z.ZodType> = new Map();
  for (const [k, v] of Object.entries(comp.elements)) {
    if (!v.type) continue;

    const elementKeys = new Map<string, string>(
      Object.keys(v).map((el) => [el.toLowerCase(), el]),
    );
    const isComputed =
      elementKeys.has("@core.computed") &&
      (v as any)[elementKeys.get("@core.computed") ?? ""] === true;

    if (isComputed) continue;

    // Check if this field is a foreign key to the parent entity in the composition
    // If so, exclude it because CAP will auto-fill it during deep insert
    const foreignKeyAnnotation = elementKeys.has("@odata.foreignkey4")
      ? elementKeys.get("@odata.foreignkey4")
      : null;
    if (foreignKeyAnnotation) {
      const associationName = (v as any)[foreignKeyAnnotation];
      // Check if the association references the parent entity
      if (associationName && comp.elements[associationName]) {
        const association = comp.elements[associationName] as any;
        if (association.target === target) {
          // This FK references the parent entity, exclude it from composition schema
          continue;
        }
      }
    }

    const parsedType = v.type.replace("cds.", "");

    if (parsedType === "Association" || parsedType === "Composition") continue; // We will not support nested compositions for now

    const isOptional = !v.key && !v.notNull;
    const paramType = determineMcpParameterType(parsedType) as z.ZodType;
    compProperties.set(k, isOptional ? paramType.optional() : paramType);
  }

  const zodType = z.object(Object.fromEntries(compProperties));
  return isArray ? z.array(zodType) : zodType;
}

/**
 * Builds a Zod schema for deep insert by referencing another entity's schema
 * Similar to buildCompositionZodType but works with explicit entity references
 * @param targetEntityName - Full entity name (e.g., 'OnPremiseBookingService.BookingItems')
 * @returns ZodType array schema for the target entity
 */
export function buildDeepInsertZodType(
  targetEntityName: string | undefined,
): z.ZodArray<z.ZodType> {
  const model = cds.model as csn.CSN;
  if (!model.definitions || !targetEntityName) {
    return z.array(z.object({})); // fallback
  }

  const targetDef = model.definitions[targetEntityName];
  if (!targetDef || !targetDef.elements) {
    return z.array(z.object({}));
  }

  const itemProperties: Map<string, z.ZodType> = new Map();
  for (const [k, v] of Object.entries(targetDef.elements)) {
    if (!v.type) continue;

    const elementKeys = new Map<string, string>(
      Object.keys(v).map((el) => [el.toLowerCase(), el]),
    );
    // Skip computed fields
    const isComputed =
      elementKeys.has("@core.computed") &&
      (v as any)[elementKeys.get("@core.computed") ?? ""] === true;
    if (isComputed) continue;

    const parsedType = v.type.replace("cds.", "");
    // Skip associations and compositions in deep insert items
    if (parsedType === "Association" || parsedType === "Composition") continue;

    // Make all non-key fields optional (consistent with direct entity create)
    // This ensures external services with notNull on all fields don't require all fields
    const paramType = determineMcpParameterType(parsedType) as z.ZodType;
    itemProperties.set(k, v.key ? paramType : paramType.optional());
  }

  const zodType = z.object(Object.fromEntries(itemProperties));
  return z.array(zodType); // Always return array for deep insert
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

  if (model.functionalities.has("expand")) {
    description += `- expand: OData $expand syntax to include related associations (e.g., $expand=* for all, or $expand=property1,property2 for specific ones)${NEW_LINE}`;
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

/**
 * Applies the omit rules for the resulting object based on the annotations.
 * Creates a copy of the input object to avoid unwanted mutations.
 * @param res
 * @param annotations
 * @returns object|undefined
 */
export function applyOmissionFilter(
  res: object | undefined,
  annotations: McpResourceAnnotation,
): object | undefined {
  if (!res)
    return res; // We do not want to parse something that does not exist
  else if (!annotations.omittedFields || annotations.omittedFields.size < 0) {
    return { ...res };
  }

  return Object.fromEntries(
    Object.entries(res).filter(([k, _]) => !annotations.omittedFields?.has(k)),
  );
}
