import { csn } from "@sap/cds";
import { LOGGER } from "../logger";
import {
  McpPromptAnnotation,
  McpResourceAnnotation,
  McpToolAnnotation,
} from "./structures";
import {
  AnnotatedMcpEntry,
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
  parseEntityKeys,
  parseOperationElements,
  parseResourceElements,
  splitDefinitionName,
} from "./utils";
import { MCP_ANNOTATION_KEY, MCP_ANNOTATION_PROPS } from "./constants";

export function parseDefinitions(model: csn.CSN): ParsedAnnotations {
  if (!model.definitions) {
    LOGGER.error("Invalid model loaded", model);
    throw new Error("Cannot parse model without valid definitions");
  }

  const result: ParsedAnnotations = new Map<string, AnnotatedMcpEntry>();
  for (const [key, value] of Object.entries(model.definitions)) {
    const parsedAnnotations = parseAnnotations(value);
    const { serviceName, target } = splitDefinitionName(key);
    parseBoundOperations(serviceName, target, value, result); // Mutates result map with bound operations

    if (!parsedAnnotations || !containsRequiredAnnotations(parsedAnnotations)) {
      continue; // This check must occur here, since we do want the bound operations even if the parent is not annotated
    }

    const verifiedAnnotations = parsedAnnotations as McpAnnotationStructure;
    switch (value.kind) {
      case "entity":
        const resourceAnnotation = constructResourceAnnotation(
          serviceName,
          target,
          verifiedAnnotations,
          value,
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

function parseAnnotations(
  definition: csn.Definition,
): Partial<McpAnnotationStructure> | undefined {
  if (!containsMcpAnnotation(definition)) return undefined;
  const annotations: Partial<McpAnnotationStructure> = {
    definition: definition,
  };

  for (const [k, v] of Object.entries(definition)) {
    if (!k.includes(MCP_ANNOTATION_KEY)) continue;
    LOGGER.debug("Parsing: ", k, v);
    switch (k) {
      case MCP_ANNOTATION_PROPS.MCP_NAME:
        annotations.name = v;
        continue;
      case MCP_ANNOTATION_PROPS.MCP_DESCRIPTION:
        annotations.description = v;
        continue;
      case MCP_ANNOTATION_PROPS.MCP_RESOURCE:
        annotations.resource = v;
        continue;
      case MCP_ANNOTATION_PROPS.MCP_TOOL:
        annotations.tool = v;
        continue;
      case MCP_ANNOTATION_PROPS.MCP_PROMPT:
        annotations.prompts = v;
        continue;
      default:
        continue;
    }
  }

  return annotations;
}

function constructResourceAnnotation(
  serviceName: string,
  target: string,
  annotations: McpAnnotationStructure,
  definition: csn.Definition,
): McpResourceAnnotation | undefined {
  if (!isValidResourceAnnotation(annotations)) return undefined;

  const functionalities = determineResourceOptions(annotations);
  const { properties, resourceKeys } = parseResourceElements(definition);

  return new McpResourceAnnotation(
    annotations.name as string,
    annotations.description as string,
    target,
    serviceName,
    functionalities,
    properties,
    resourceKeys,
  );
}

function constructToolAnnotation(
  serviceName: string,
  target: string,
  annotations: McpAnnotationStructure,
  entityKey?: string,
  keyParams?: Map<string, string>,
): McpToolAnnotation | undefined {
  if (!isValidToolAnnotation(annotations)) return undefined;

  const { parameters, operationKind } = parseOperationElements(annotations);
  return new McpToolAnnotation(
    annotations.name,
    annotations.description,
    target,
    serviceName,
    parameters,
    entityKey,
    operationKind,
    keyParams,
  );
}

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
 * Parses the bound operations found on the entity definition if any.
 * This function mutates the passed result reference object.
 */
function parseBoundOperations(
  serviceName: string,
  entityKey: string,
  definition: csn.Definition,
  resultRef: ParsedAnnotations,
): void {
  if (definition.kind !== "entity") return;

  const boundOperations: Record<string, csn.Definition> = (definition as any)
    .actions; // Necessary due to missing type reference
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
