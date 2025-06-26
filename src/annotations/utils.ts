import { csn } from "@sap/cds";
import { DEFAULT_ALL_RESOURCE_OPTIONS, MCP_ANNOTATION_KEY } from "./constants";
import { McpAnnotationStructure, McpResourceOption } from "./types";
import { LOGGER } from "../logger";

export function splitDefinitionName(definition: string): {
  serviceName: string;
  target: string;
} {
  const splitted = definition.split(".");
  return {
    serviceName: splitted[0],
    target: splitted[1],
  };
}

export function containsMcpAnnotation(definition: csn.Definition): boolean {
  for (const key of Object.keys(definition)) {
    if (!key.includes(MCP_ANNOTATION_KEY)) continue;
    return true;
  }
  return false;
}

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

export function determineResourceOptions(
  annotations: Partial<McpAnnotationStructure>,
): Set<McpResourceOption> {
  if (!Array.isArray(annotations.resource)) return DEFAULT_ALL_RESOURCE_OPTIONS;
  return new Set<McpResourceOption>(annotations.resource);
}

export function parseResourceElements(definition: csn.Definition): {
  properties: Map<string, string>;
  resourceKeys: Map<string, string>;
} {
  const properties = new Map<string, string>();
  const resourceKeys = new Map<string, string>();

  for (const [key, value] of Object.entries(definition.elements)) {
    if (!value.type) continue;
    const parsedType = value.type.replace("cds.", "");
    properties.set(key, parsedType);

    if (!value.key) continue;
    resourceKeys.set(key, parsedType);
  }

  return {
    properties,
    resourceKeys,
  };
}

export function parseOperationElements(annotations: McpAnnotationStructure): {
  parameters?: Map<string, string>;
  operationKind?: string;
} {
  let parameters: Map<string, string> | undefined;

  const params: { [key: string]: { type: string } } = (
    annotations.definition as any
  )["params"];
  if (params && Object.entries(params).length > 0) {
    parameters = new Map<string, string>();
    for (const [k, v] of Object.entries(params)) {
      parameters.set(k, v.type.replace("cds.", ""));
    }
  }

  return {
    parameters,
    operationKind: annotations.definition.kind,
  };
}

export function parseEntityKeys(
  definition: csn.Definition,
): Map<string, string> {
  const result = new Map<string, string>();
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
