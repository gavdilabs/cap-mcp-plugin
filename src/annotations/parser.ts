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
  ParsedAnnotations,
} from "./types";
import {
  containsMcpAnnotation,
  containsRequiredAnnotations,
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
import {
  CDS_AUTH_ANNOTATIONS,
  MCP_ANNOTATION_KEY,
  MCP_ANNOTATION_PROPS,
} from "./constants";

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
    parseBoundOperations(serviceName, target, def, result); // Mutates result map with bound operations

    if (!parsedAnnotations || !containsRequiredAnnotations(parsedAnnotations)) {
      continue; // This check must occur here, since we do want the bound operations even if the parent is not annotated
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
          serviceName,
          target,
          verifiedAnnotations,
        );
        if (!functionAnnotation) continue;
        result.set(functionAnnotation.target, functionAnnotation);
        continue;
      case "action":
        const actionAnnotation = constructToolAnnotation(
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

/**
 * Parses MCP annotations from a definition object
 * @param definition - The definition object to parse annotations from
 * @returns Partial annotation structure or undefined if no MCP annotations found
 */
function parseAnnotations(
  definition: csn.Definition,
): Partial<McpAnnotationStructure> | undefined {
  if (!containsMcpAnnotation(definition)) return undefined;
  const annotations: Partial<McpAnnotationStructure> = {
    definition: definition,
  };

  for (const [k, v] of Object.entries(definition as any)) {
    if (!k.includes(MCP_ANNOTATION_KEY)) continue;
    LOGGER.debug("Parsing: ", k, v);
    switch (k) {
      case MCP_ANNOTATION_PROPS.MCP_NAME:
        annotations.name = v as string;
        continue;
      case MCP_ANNOTATION_PROPS.MCP_DESCRIPTION:
        annotations.description = v as string;
        continue;
      case MCP_ANNOTATION_PROPS.MCP_RESOURCE:
        annotations.resource = v as any;
        continue;
      case MCP_ANNOTATION_PROPS.MCP_TOOL:
        annotations.tool = v as boolean;
        continue;
      case MCP_ANNOTATION_PROPS.MCP_PROMPT:
        annotations.prompts = v as any;
        continue;
      case MCP_ANNOTATION_PROPS.MCP_WRAP:
        // Wrapper container to expose resources as tools
        annotations.wrap = v as any;
        continue;
      case CDS_AUTH_ANNOTATIONS.REQUIRES:
        annotations.requires = v as string;
        continue;
      case CDS_AUTH_ANNOTATIONS.RESTRICT:
        annotations.restrict = v as CdsRestriction[];
      default:
        continue;
    }
  }

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
  serviceName: string,
  target: string,
  annotations: McpAnnotationStructure,
  entityKey?: string,
  keyParams?: Map<string, string>,
): McpToolAnnotation | undefined {
  if (!isValidToolAnnotation(annotations)) return undefined;

  const { parameters, operationKind } = parseOperationElements(annotations);
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

    if (!parsedAnnotations || !containsRequiredAnnotations(parsedAnnotations)) {
      continue;
    }

    const verifiedAnnotations = parsedAnnotations as McpAnnotationStructure;
    const toolAnnotation = constructToolAnnotation(
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
