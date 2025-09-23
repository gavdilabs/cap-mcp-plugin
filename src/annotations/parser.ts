// @ts-ignore - types for '@sap/cds' are not always present during build
import { csn } from "@sap/cds";
import { LOGGER } from "../logger";
import {
  McpPromptAnnotation,
  McpResourceAnnotation,
  McpToolAnnotation,
} from "./structures";
import {
  AnnotatedMcpEntry,
  CdsRestriction,
  McpAnnotationPrompt,
  McpAnnotationStructure,
  McpAnnotationWrap,
  ParsedAnnotations,
} from "./types";
import {
  containsMcpAnnotation,
  containsRequiredAnnotations,
  containsRequiredElicitedParams,
  determineResourceOptions,
  isValidPromptsAnnotation,
  isValidResourceAnnotation,
  isValidToolAnnotation,
  parseCdsRestrictions,
  parseEntityKeys,
  parseOperationElements,
  parseResourceElements,
  splitDefinitionName,
} from "./utils";
import { MCP_ANNOTATION_MAPPING } from "./constants";

/**
 * Parses model definitions to extract MCP annotations and return them as a map of annotated entries
 * @param model - The CSN model containing definitions to parse
 * @returns A map of target names to their corresponding MCP annotation entries
 * @throws Error if model lacks valid definitions
 */
export function parseDefinitions(model: csn.CSN): ParsedAnnotations {
  if (!model.definitions) {
    LOGGER.error("Invalid model loaded", model);
    throw new Error("Cannot parse model without valid definitions");
  }

  const result: ParsedAnnotations = new Map<string, AnnotatedMcpEntry>();
  for (const [key, value] of Object.entries(
    model.definitions as Record<string, unknown>,
  )) {
    // Narrow unknown to csn.Definition with a runtime check
    const def = value as csn.Definition;
    const parsedAnnotations = parseAnnotations(def);
    const { serviceName, target } = splitDefinitionName(key);
    parseBoundOperations(model, serviceName, target, def, result); // Mutates result map with bound operations

    if (!parsedAnnotations || !containsRequiredAnnotations(parsedAnnotations)) {
      continue; // This check must occur here, since we do want the bound operations even if the parent is not annotated
    }

    // Set the target in annotations for error reporting
    if (parsedAnnotations) {
      parsedAnnotations.target = key;
    }

    if (!containsRequiredElicitedParams(parsedAnnotations)) {
      continue; // Really doesn't do anything as the method will throw if the implementation is invalid
    }

    const verifiedAnnotations = parsedAnnotations as McpAnnotationStructure;
    switch (def.kind) {
      case "entity":
        const resourceAnnotation = constructResourceAnnotation(
          serviceName,
          target,
          verifiedAnnotations,
          def,
        );
        if (!resourceAnnotation) continue;
        result.set(resourceAnnotation.target, resourceAnnotation);
        continue;
      case "function":
        const functionAnnotation = constructToolAnnotation(
          model,
          serviceName,
          target,
          verifiedAnnotations,
        );
        if (!functionAnnotation) continue;
        result.set(functionAnnotation.target, functionAnnotation);
        continue;
      case "action":
        const actionAnnotation = constructToolAnnotation(
          model,
          serviceName,
          target,
          verifiedAnnotations,
        );
        if (!actionAnnotation) continue;
        result.set(actionAnnotation.target, actionAnnotation);
        continue;
      case "service":
        const promptsAnnotation = constructPromptAnnotation(
          serviceName,
          verifiedAnnotations,
        );
        if (!promptsAnnotation) continue;
        result.set(promptsAnnotation.target, promptsAnnotation);
        continue;
      default:
        continue;
    }
  }

  return result;
}

function mapToMcpAnnotationStructure(
  obj: Record<string, any>,
): Partial<McpAnnotationStructure> {
  const result: Partial<McpAnnotationStructure> = {};

  // Helper function to set nested properties
  const setNestedValue = (target: any, path: string, value: any): void => {
    const keys = path.split(".");
    const lastKey = keys.pop()!;
    const nestedTarget = keys.reduce((current, key) => {
      if (!(key in current)) {
        current[key] = {};
      }
      return current[key];
    }, target);

    // If the target already has a value and both are objects, merge them
    if (
      typeof nestedTarget[lastKey] === "object" &&
      typeof value === "object" &&
      nestedTarget[lastKey] !== null &&
      value !== null &&
      !Array.isArray(nestedTarget[lastKey]) &&
      !Array.isArray(value)
    ) {
      nestedTarget[lastKey] = { ...nestedTarget[lastKey], ...value };
    } else {
      nestedTarget[lastKey] = value;
    }
  };

  // Loop through object keys and map them
  for (const key in obj) {
    if (MCP_ANNOTATION_MAPPING.has(key)) {
      const mappedPath = MCP_ANNOTATION_MAPPING.get(key)!;
      setNestedValue(result, mappedPath, obj[key]);
    }
  }

  return result;
}

/**
 * Parses MCP annotations from a definition object
 * @param definition - The definition object to parse annotations from
 * @returns Partial annotation structure or undefined if no MCP annotations found
 */
function parseAnnotations(
  definition: csn.Definition,
): Partial<McpAnnotationStructure> | undefined {
  if (!containsMcpAnnotation(definition)) return undefined;
  const parsed = mapToMcpAnnotationStructure(definition);
  const annotations: Partial<McpAnnotationStructure> = {
    definition: definition,
    ...parsed,
  };

  return annotations;
}

/**
 * Constructs a resource annotation from parsed annotation data
 * @param serviceName - Name of the service containing the resource
 * @param target - Target entity name
 * @param annotations - Parsed annotation structure
 * @param definition - CSN definition object
 * @returns Resource annotation or undefined if invalid
 */
function constructResourceAnnotation(
  serviceName: string,
  target: string,
  annotations: McpAnnotationStructure,
  definition: csn.Definition,
): McpResourceAnnotation | undefined {
  if (!isValidResourceAnnotation(annotations)) return undefined;

  const functionalities = determineResourceOptions(annotations);
  const { properties, resourceKeys } = parseResourceElements(definition);
  const restrictions = parseCdsRestrictions(
    annotations.restrict,
    annotations.requires,
  );

  return new McpResourceAnnotation(
    annotations.name as string,
    annotations.description as string,
    target,
    serviceName,
    functionalities,
    properties,
    resourceKeys,
    annotations.wrap,
    restrictions,
  );
}

/**
 * Constructs a tool annotation from parsed annotation data
 * @param serviceName - Name of the service containing the tool
 * @param target - Target operation name
 * @param annotations - Parsed annotation structure
 * @param entityKey - Optional entity key for bound operations
 * @param keyParams - Optional key parameters for bound operations
 * @returns Tool annotation or undefined if invalid
 */
function constructToolAnnotation(
  model: csn.CSN,
  serviceName: string,
  target: string,
  annotations: McpAnnotationStructure,
  entityKey?: string,
  keyParams?: Map<string, string>,
): McpToolAnnotation | undefined {
  if (!isValidToolAnnotation(annotations)) return undefined;

  const { parameters, operationKind } = parseOperationElements(
    annotations,
    model,
  );
  const restrictions = parseCdsRestrictions(
    annotations.restrict,
    annotations.requires,
  );
  return new McpToolAnnotation(
    annotations.name,
    annotations.description,
    target,
    serviceName,
    parameters,
    entityKey,
    operationKind,
    keyParams,
    restrictions,
    annotations.elicit,
  );
}

/**
 * Constructs a prompt annotation from parsed annotation data
 * @param serviceName - Name of the service containing the prompts
 * @param annotations - Parsed annotation structure
 * @returns Prompt annotation or undefined if invalid
 */
function constructPromptAnnotation(
  serviceName: string,
  annotations: McpAnnotationStructure,
): McpPromptAnnotation | undefined {
  if (!isValidPromptsAnnotation(annotations)) return undefined;
  return new McpPromptAnnotation(
    annotations.name,
    annotations.description,
    serviceName,
    annotations.prompts as McpAnnotationPrompt[],
  );
}

/**
 * Parses bound operations (actions/functions) attached to an entity definition
 * Extracts MCP tool annotations from entity-level operations and adds them to the result map
 * @param serviceName - Name of the service containing the entity
 * @param entityKey - Name of the entity that owns these bound operations
 * @param definition - CSN entity definition containing bound operations
 * @param resultRef - Map to store parsed annotations (mutated by this function)
 */
function parseBoundOperations(
  model: csn.CSN,
  serviceName: string,
  entityKey: string,
  definition: csn.Definition,
  resultRef: ParsedAnnotations,
): void {
  if (definition.kind !== "entity") return;

  const boundOperations: Record<string, csn.Definition> = (definition as any)
    .actions; // NOTE: Necessary due to missing type reference in cds-types
  if (!boundOperations) return;

  const keyParams = parseEntityKeys(definition);

  for (const [k, v] of Object.entries(boundOperations)) {
    if (v.kind !== "function" && v.kind !== "action") continue;
    const parsedAnnotations = parseAnnotations(v);

    // Set the target in annotations for error reporting
    if (parsedAnnotations) {
      parsedAnnotations.target = k;
    }

    if (
      !parsedAnnotations ||
      !containsRequiredAnnotations(parsedAnnotations) ||
      !containsRequiredElicitedParams(parsedAnnotations)
    ) {
      continue;
    }

    const verifiedAnnotations = parsedAnnotations as McpAnnotationStructure;
    const toolAnnotation = constructToolAnnotation(
      model,
      serviceName,
      k,
      verifiedAnnotations,
      entityKey,
      keyParams,
    );
    if (!toolAnnotation) continue;

    resultRef.set(k, toolAnnotation);
  }
}
