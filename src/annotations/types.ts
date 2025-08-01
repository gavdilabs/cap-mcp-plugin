import { csn } from "@sap/cds";
import {
  McpPromptAnnotation,
  McpResourceAnnotation,
  McpToolAnnotation,
} from "./structures";

/**
 * Valid MCP annotation types that can be applied to CAP definitions
 * Each annotation type serves a different purpose in the MCP protocol
 */
export type McpDataType = "prompt" | "tool" | "resource";

/**
 * OData query capabilities that can be enabled for MCP resources
 * Each option corresponds to a specific OData v4 query parameter
 */
export type McpResourceOption =
  | "filter" // $filter - OData filter expressions
  | "orderby" // $orderby - Sorting specifications
  | "select" // $select - Property selection
  | "top" // $top - Limit number of results
  | "skip"; // $skip - Skip number of results

/**
 * Resource annotation configuration options
 * Can be either a boolean (all options) or specific array of capabilities
 */
export type McpResourceType = boolean | Array<McpResourceOption>;

/**
 * Union type representing any parsed and validated MCP annotation
 * Used as values in the ParsedAnnotations map
 */
export type AnnotatedMcpEntry =
  | McpResourceAnnotation
  | McpToolAnnotation
  | McpPromptAnnotation;

/**
 * Map of target names to their corresponding MCP annotations
 * Keys are entity/operation/service names, values are typed annotation objects
 */
export type ParsedAnnotations = Map<string, AnnotatedMcpEntry>;

/**
 * Reference type showing the expected structure of MCP annotations in CDS files
 * This is the format developers use when writing @mcp annotations
 */
export type McpReferenceAnnotationStructure = {
  "@mcp.name": string;
  "@mcp.description": string;
  "@mcp.resource"?: boolean | Array<McpResourceOption>;
  "@mcp.tool"?: boolean;
  "@prompts"?: McpAnnotationPrompt[];
};

/**
 * Internal structure used during annotation parsing and validation
 * Contains both parsed annotation data and the original CSN definition
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
 * Configuration structure for individual prompt templates
 * Defines template content, inputs, and metadata for MCP prompts
 */
export type McpAnnotationPrompt = {
  name: string;
  title: string;
  description: string;
  template: string;
  role: "user" | "assistant"; // Can only be 'user' or 'assistant', people can input anything so we must validate
  inputs?: McpAnnotationPromptInput[];
};

/**
 * Input parameter definition for prompt templates
 * Specifies variable names and types for template substitution
 */
export type McpAnnotationPromptInput = {
  /** Variable name used in template substitution (e.g., 'title' for {{title}}) */
  key: string;
  /** CDS type string for parameter validation (e.g., 'String', 'Integer') */
  type: string;
};
