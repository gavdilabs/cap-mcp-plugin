import { csn } from "@sap/cds";
import { DEFAULT_ALL_RESOURCE_OPTIONS, MCP_ANNOTATION_KEY } from "./constants";
import {
  CdsRestriction,
  CdsRestrictionType,
  McpAnnotationStructure,
  McpResourceOption,
  McpRestriction,
  McpRestrictionType,
} from "./types";
import { LOGGER } from "../logger";

/**
 * Splits a definition name into service name and target
 * @param definition - The definition name to split
 * @returns Object containing serviceName and target
 */
export function splitDefinitionName(definition: string): {
  serviceName: string;
  target: string;
} {
  if (definition?.length <= 0) {
    throw new Error("Invalid definition name. Cannot be split");
  }

  const splitted = definition.split(".");
  if (splitted.length <= 1) {
    return {
      serviceName: splitted[0],
      target: "",
    };
  }

  const target = splitted.pop();
  const serviceName = splitted.join(".");
  return {
    serviceName: serviceName,
    target: target ?? "",
  };
}

/**
 * Checks if a definition contains any MCP annotations
 * @param definition - The definition to check
 * @returns True if MCP annotations are found, false otherwise
 */
export function containsMcpAnnotation(definition: csn.Definition): boolean {
  for (const key of Object.keys(definition)) {
    if (!key.includes(MCP_ANNOTATION_KEY)) continue;
    return true;
  }
  return false;
}

/**
 * Validates that required MCP annotations are present and valid
 * @param annotations - The annotation structure to validate
 * @returns True if valid, throws error if invalid
 * @throws Error if required annotations are missing
 */
export function containsRequiredAnnotations(
  annotations: Partial<McpAnnotationStructure>,
): boolean {
  if (annotations.definition?.kind === "service") return true;

  if (!annotations?.name || annotations.name.length <= 0) {
    throw new Error(
      `Invalid annotation '${annotations.definition?.target}' - Missing required property 'name'`,
    );
  }

  if (!annotations?.description || annotations.description.length <= 0) {
    throw new Error(
      "Invalid annotation - Missing required property 'description'",
    );
  }

  return true;
}

/**
 * Validates that the required params for MCP elicited user input annotations are valid
 * @param annotations - The annotation structure to validate
 * @returns True if valid, throw error if invalid
 * @throws Error if required annotations are missing
 */
export function containsRequiredElicitedParams(
  annotations: Partial<McpAnnotationStructure>,
): boolean {
  if (!annotations.elicit) return true;

  const param = annotations.elicit;
  if (!param || param?.length <= 0) {
    throw new Error(
      `Invalid annotation '${annotations.target}' - Incomplete elicited user input`,
    );
  }

  return true;
}

/**
 * Validates a resource annotation structure
 * @param annotations - The annotation structure to validate
 * @returns True if valid, throws error if invalid
 * @throws Error if resource annotation is invalid
 */
export function isValidResourceAnnotation(
  annotations: Partial<McpAnnotationStructure>,
): boolean {
  if (!annotations?.resource) {
    throw new Error(
      `Invalid annotation '${annotations.definition?.target}' - Missing required flag 'resource'`,
    );
  }

  if (Array.isArray(annotations.resource)) {
    for (const el of annotations.resource) {
      if (DEFAULT_ALL_RESOURCE_OPTIONS.has(el)) continue;
      throw new Error(
        `Invalid annotation '${annotations.definition?.target}' - Invalid resource option: ${el}`,
      );
    }
  }

  return true;
}

/**
 * Validates a tool annotation structure
 * @param annotations - The annotation structure to validate
 * @returns True if valid, throws error if invalid
 * @throws Error if tool annotation is invalid
 */
export function isValidToolAnnotation(
  annotations: Partial<McpAnnotationStructure>,
): boolean {
  if (!annotations?.tool) {
    throw new Error(
      `Invalid annotation '${annotations.definition?.target}' - Missing required flag 'tool'`,
    );
  }

  return true;
}

/**
 * Validates a prompts annotation structure
 * @param annotations - The annotation structure to validate
 * @returns True if valid, throws error if invalid
 * @throws Error if prompts annotation is invalid
 */
export function isValidPromptsAnnotation(
  annotations: Partial<McpAnnotationStructure>,
): boolean {
  if (!annotations?.prompts) {
    throw new Error(
      `Invalid annotation '${annotations.definition?.target}' - Missing prompts annotations`,
    );
  }

  for (const prompt of annotations.prompts) {
    if (!prompt.template || prompt.template.length <= 0) {
      throw new Error(
        `Invalid annotation '${annotations.definition?.target}' - Missing valid template`,
      );
    }

    if (!prompt.name || prompt.name.length <= 0) {
      throw new Error(
        `Invalid annotation '${annotations.definition?.target}' - Missing valid name`,
      );
    }

    if (!prompt.title || prompt.title.length <= 0) {
      throw new Error(
        `Invalid annotation '${annotations.definition?.target}' - Missing valid title`,
      );
    }

    if (
      !prompt.role ||
      (prompt.role !== "user" && prompt.role !== "assistant")
    ) {
      throw new Error(
        `Invalid annotation '${annotations.definition?.target}' - Role must be 'user' or 'assistant'`,
      );
    }

    prompt.inputs?.forEach((el) => {
      if (!el.key || el.key.length <= 0) {
        throw new Error(
          `Invalid annotation '${annotations.definition?.target}' - missing input key`,
        );
      }

      if (!el.type || el.type.length <= 0) {
        throw new Error(
          `Invalid annotation '${annotations.definition?.target}' - missing input type`,
        );
      }

      // TODO: Verify the input type against valid data types
    });
  }

  return true;
}

/**
 * Determines resource options from annotation structure
 * @param annotations - The annotation structure to process
 * @returns Set of resource options, defaults to all options if not specified
 */
export function determineResourceOptions(
  annotations: Partial<McpAnnotationStructure>,
): Set<McpResourceOption> {
  if (!Array.isArray(annotations.resource)) return DEFAULT_ALL_RESOURCE_OPTIONS;
  return new Set<McpResourceOption>(annotations.resource);
}

/**
 * Parses resource elements from a definition to extract properties and keys
 * @param definition - The definition to parse
 * @returns Object containing properties and resource keys maps
 */
export function parseResourceElements(
  definition: csn.Definition,
  model: csn.CSN,
): {
  properties: Map<string, string>;
  resourceKeys: Map<string, string>;
} {
  const properties = new Map<string, string>();
  const resourceKeys = new Map<string, string>();
  const parseParam = (
    k: string,
    v: Omit<OperationParameter, "items">,
    suffix?: string,
  ) => {
    let result: string = "";

    if (typeof v.type !== "string") {
      const referencedType = parseTypedReference(v.type, model);
      result = `${referencedType}${suffix ?? ""}`;
    } else {
      result = `${v.type.replace("cds.", "")}${suffix ?? ""}`;
    }

    properties?.set(k, result);
    return result;
  };

  for (const [k, v] of Object.entries(definition.elements || {})) {
    if (v.items) {
      const result = parseParam(k, v.items, "Array");

      if (!v.key) continue;
      resourceKeys.set(k, result);
      continue;
    }

    const result = parseParam(k, v);

    if (!v.key || v.type === "cds.Association") continue;
    resourceKeys.set(k, result);
  }

  return {
    properties,
    resourceKeys,
  };
}

/**
 * Operation parameter type for CSN operations
 */
type OperationParameter = {
  type?: string | { ref: string[] };
  items?: { type: string | { ref: string[] } };
};

/**
 * Parses operation elements from annotation structure
 * @param annotations - The annotation structure to parse
 * @returns Object containing parameters and operation kind
 */
export function parseOperationElements(
  annotations: McpAnnotationStructure,
  model: csn.CSN,
): {
  parameters?: Map<string, string>;
  operationKind?: string;
} {
  let parameters: Map<string, string> | undefined;
  const parseParam = (
    k: string,
    v: Omit<OperationParameter, "items">,
    suffix?: string,
  ) => {
    if (typeof v.type !== "string") {
      const referencedType = parseTypedReference(v.type, model);
      parameters?.set(k, `${referencedType}${suffix ?? ""}`);
      return;
    }

    parameters?.set(k, `${v.type.replace("cds.", "")}${suffix ?? ""}`);
  };

  const params: { [key: string]: OperationParameter } = (
    annotations.definition as any
  )["params"];

  if (params && Object.entries(params).length > 0) {
    parameters = new Map<string, string>();
    for (const [k, v] of Object.entries(params)) {
      if (v.items) {
        parseParam(k, v.items, "Array");
        continue;
      }

      parseParam(k, v);
    }
  }

  return {
    parameters,
    operationKind: annotations.definition.kind,
  };
}

/**
 * Recursively digs through the typed reference object of an operation parameter.
 * @param param
 * @param model
 * @returns string|undefined
 * @throws Error if nested type is not parseable
 */
function parseTypedReference(
  param: { ref?: string[] } | undefined,
  model: csn.CSN,
): string {
  if (!param || !param.ref) {
    throw new Error("Failed to parse nested type reference");
  }

  const referenceType =
    model.definitions?.[param.ref[0]].elements[param.ref[1]];
  return typeof referenceType?.type === "string"
    ? referenceType.type?.replace("cds.", "")
    : parseTypedReference(referenceType?.type, model);
}

/**
 * Parses entity keys from a definition
 * @param definition - The definition to parse keys from
 * @returns Map of key names to their types
 * @throws Error if invalid key type is found
 */
export function parseEntityKeys(
  definition: csn.Definition,
): Map<string, string> {
  const result = new Map<string, string>();

  if (!definition?.elements) return result; // If there is no defined elements, we exit early

  for (const [k, v] of Object.entries(definition.elements)) {
    if (!v.key) continue;
    if (!v.type) {
      LOGGER.error("Invalid key type", k);
      throw new Error("Invalid key type found for bound operation");
    }

    result.set(k, v.type.replace("cds.", ""));
  }
  return result;
}

/**
 * Parses the CDS role restrictions to be used for MCP
 */
export function parseCdsRestrictions(
  restrictions: CdsRestriction[] | undefined,
  requires: string | undefined,
): McpRestriction[] {
  if (!restrictions && !requires) return [];

  const result: McpRestriction[] = [];
  if (requires) {
    result.push({
      role: requires,
    });
  }

  if (!restrictions || restrictions.length <= 0) return result;
  for (const el of restrictions) {
    const ops = mapOperationRestriction(el.grant);
    if (!el.to) {
      result.push({
        role: "authenticated-user",
        operations: ops,
      });
      continue;
    }

    const mapped: McpRestriction[] = Array.isArray(el.to)
      ? el.to.map((to) => ({
          role: to,
          operations: ops,
        }))
      : [{ role: el.to, operations: ops }];

    result.push(...mapped);
  }
  return result;
}

/**
 * Maps the "grant" property from CdsRestriction to McpRestriction
 */
function mapOperationRestriction(
  cdsRestrictions: CdsRestrictionType[] | CdsRestrictionType,
): McpRestrictionType[] {
  if (!cdsRestrictions || cdsRestrictions.length <= 0) {
    return ["CREATE", "READ", "UPDATE", "DELETE"];
  }

  if (!Array.isArray(cdsRestrictions)) {
    return translateOperationRestriction(cdsRestrictions);
  }

  const result: McpRestrictionType[] = [];
  for (const el of cdsRestrictions) {
    const translated = translateOperationRestriction(el);
    if (!translated || translated.length <= 0) continue;
    result.push(...translated);
  }

  return result;
}

function translateOperationRestriction(
  restrictionType: CdsRestrictionType,
): McpRestrictionType[] {
  switch (restrictionType) {
    case "CHANGE":
      return ["UPDATE"];
    case "WRITE":
      return ["CREATE", "UPDATE", "DELETE"];
    case "*":
      return ["CREATE", "READ", "UPDATE", "DELETE"];
    default:
      return [restrictionType as McpRestrictionType];
  }
}
