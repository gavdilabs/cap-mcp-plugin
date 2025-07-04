import { csn } from "@sap/cds";
import {
  McpPromptAnnotation,
  McpResourceAnnotation,
  McpToolAnnotation,
} from "./structures";

/**
 * Valid types of possible annotations
 * A annotation must be one of the three types.
 */
export type McpDataType = "prompt" | "tool" | "resource";

/**
 * Valid options for configuration of a resource annotation
 */
export type McpResourceOption =
  | "filter"
  | "orderby"
  | "select"
  | "top"
  | "skip";

/**
 * The two different possible types of resource annotation
 */
export type McpResourceType = boolean | Array<McpResourceOption>;

/**
 * Utility type for refering to either of the three parsed annotation versions
 */
export type AnnotatedMcpEntry =
  | McpResourceAnnotation
  | McpToolAnnotation
  | McpPromptAnnotation;

/**
 * Utility type for referring to a parsed annotation
 * The key is the owner of the annotation, i.e. the entity, operation or service that has been annotated.
 */
export type ParsedAnnotations = Map<string, AnnotatedMcpEntry>;

/**
 * The expected structure of the annotations.
 * Mainly here for reference purposes.
 */
export type McpReferenceAnnotationStructure = {
  "@mcp.name": string;
  "@mcp.description": string;
  "@mcp.resource"?: boolean | Array<McpResourceOption>;
  "@mcp.tool"?: boolean;
  "@prompts"?: McpAnnotationPrompt[];
};

/**
 * Runtime parsing object for determination of annotated definitions
 * Should be verified with validation functions
 */
export type McpAnnotationStructure = {
  definition: csn.Definition; // Runtime only - not for annotations
  name: string;
  description: string;
  resource?: boolean | Array<McpResourceOption>;
  tool?: boolean;
  prompts?: McpAnnotationPrompt[];
};

/**
 * Annotation structure for prompts
 */
export type McpAnnotationPrompt = {
  name: string;
  title: string;
  description: string;
  template: string;
  role: "user" | "assistant"; // Can only be 'user' or 'assistant', people can input anything so we must validate
  inputs?: McpAnnotationPromptInput[];
};

// TODO: JSDocs

export type McpAnnotationPromptInput = {
  key: string;
  type: string;
};
