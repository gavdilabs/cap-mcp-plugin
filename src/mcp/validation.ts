import { z } from "zod";
import { LOGGER } from "../logger";

/**
 * Validation schemas and utilities for OData query parameters
 */

// Allowed OData operators
const ALLOWED_OPERATORS = new Set([
  "eq",
  "ne",
  "gt",
  "ge",
  "lt",
  "le",
  "and",
  "or",
  "not",
  "contains",
  "startswith",
  "endswith",
  "indexof",
  "length",
  "substring",
  "tolower",
  "toupper",
  "trim",
]);

// Forbidden patterns that could indicate injection attempts
const FORBIDDEN_PATTERNS = [
  /;/g, // SQL statement terminator
  /--/g, // SQL comment
  /\/\*/g, // Multi-line comment start
  /\*\//g, // Multi-line comment end
  /xp_/gi, // Extended procedures
  /sp_/gi, // Stored procedures
  /exec/gi, // Execute command
  /union/gi, // Union queries
  /insert/gi, // Insert statements
  /update/gi, // Update statements
  /delete/gi, // Delete statements
  /drop/gi, // Drop statements
  /create/gi, // Create statements
  /alter/gi, // Alter statements
  /script/gi, // Script tags
  /javascript/gi, // JavaScript
  /eval/gi, // Eval function
  /expression/gi, // Expression evaluation
  /\bor\s+\d+\s*=\s*\d+/gi, // SQL injection pattern like \"OR 1=1\"
  /\band\s+\d+\s*=\s*\d+/gi, // SQL injection pattern like \"AND 1=1\"
];

// Validation schemas
export const ODataQueryValidationSchemas = {
  top: z.number().int().min(1).max(1000),
  skip: z.number().int().min(0),
  select: z
    .string()
    .min(1)
    .max(500)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_,\s]*$/),
  orderby: z
    .string()
    .min(1)
    .max(200)
    .regex(
      /^[a-zA-Z_][a-zA-Z0-9_\s]+(asc|desc)?(,\s*[a-zA-Z_][a-zA-Z0-9_\s]+(asc|desc)?)*$/i,
    ),
  filter: z.string().min(1).max(1000),
};

/**
 * Validates and sanitizes OData query parameters
 */
export class ODataQueryValidator {
  private allowedProperties: Set<string>;
  private allowedTypes: Map<string, string>;

  constructor(properties: Map<string, string>) {
    this.allowedProperties = new Set(properties.keys());
    this.allowedTypes = new Map(properties);
  }

  /**
   * Validates a top parameter
   */
  validateTop(value: string): number {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || !Number.isInteger(parsed)) {
      throw new Error(`Invalid top parameter: ${value}`);
    }
    return ODataQueryValidationSchemas.top.parse(parsed);
  }

  /**
   * Validates a skip parameter
   */
  validateSkip(value: string): number {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || !Number.isInteger(parsed)) {
      throw new Error(`Invalid skip parameter: ${value}`);
    }
    return ODataQueryValidationSchemas.skip.parse(parsed);
  }

  /**
   * Validates and sanitizes select parameter
   */
  validateSelect(value: string): string[] {
    const decoded = decodeURIComponent(value);
    const validated = ODataQueryValidationSchemas.select.parse(decoded);

    const columns = validated.split(",").map((col) => col.trim());

    // Validate each column exists in entity
    for (const column of columns) {
      if (!this.allowedProperties.has(column)) {
        throw new Error(
          `Invalid select column: ${column}. Allowed columns: ${Array.from(this.allowedProperties).join(", ")}`,
        );
      }
    }

    return columns;
  }

  /**
   * Validates and sanitizes orderby parameter
   */
  validateOrderBy(value: string): string {
    const decoded = decodeURIComponent(value);
    const validated = ODataQueryValidationSchemas.orderby.parse(decoded);

    // Extract property names and validate they exist
    const orderClauses = validated.split(",").map((clause) => clause.trim());

    for (const clause of orderClauses) {
      const parts = clause.split(/\s+/);
      const property = parts[0];

      if (!this.allowedProperties.has(property)) {
        throw new Error(
          `Invalid orderby property: ${property}. Allowed properties: ${Array.from(this.allowedProperties).join(", ")}`,
        );
      }
    }

    return validated;
  }

  /**
   * Validates and sanitizes filter parameter with comprehensive security checks
   */
  validateFilter(value: string): string {
    if (!value || value.trim().length === 0) {
      throw new Error("Filter parameter cannot be empty");
    }

    const decoded = decodeURIComponent(value);
    const validated = ODataQueryValidationSchemas.filter.parse(decoded);

    // Check for forbidden patterns
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(validated)) {
        LOGGER.warn(
          `Potentially malicious filter pattern detected: ${pattern.source}`,
        );
        throw new Error("Filter contains forbidden patterns");
      }
    }

    // Parse and validate filter structure
    return this.parseAndValidateFilter(validated);
  }

  /**
   * Parses OData filter and validates property references and operators
   */
  private parseAndValidateFilter(filter: string): string {
    // Tokenize the filter expression
    const tokens = this.tokenizeFilter(filter);

    // Validate tokens
    this.validateFilterTokens(tokens);

    // Convert OData operators to CDS syntax
    return this.convertToCdsFilter(tokens);
  }

  /**
   * Tokenizes filter expression into logical components
   */
  private tokenizeFilter(filter: string): FilterToken[] {
    const tokens: FilterToken[] = [];

    // Enhanced tokenizer with OData operator support - literals first to avoid misclassification
    const tokenRegex =
      /(\b(?:eq|ne|gt|ge|lt|le|contains|startswith|endswith)\b)|('[^']*'|"[^"]*"|\d+(?:\.\d+)?)|([<>=!]+)|(\b(?:and|or|not)\b)|(\(|\))|(\w+)/gi;
    let match;

    while ((match = tokenRegex.exec(filter)) !== null) {
      const token = match[0];

      if (match[1]) {
        // OData operators
        tokens.push({ type: "operator", value: token.toLowerCase() });
      } else if (match[2]) {
        // Literal values (strings, numbers) - prioritized to avoid misclassification
        tokens.push({ type: "literal", value: token });
      } else if (match[3]) {
        // Comparison operators
        tokens.push({ type: "operator", value: token });
      } else if (match[4]) {
        // Logical operators
        tokens.push({ type: "logical", value: token.toLowerCase() });
      } else if (match[5]) {
        // Parentheses
        tokens.push({ type: "paren", value: token });
      } else if (match[6]) {
        // Property or function names
        tokens.push({ type: "property", value: token });
      }
    }

    return tokens;
  }

  /**
   * Validates filter tokens against allowed properties and operators
   */
  private validateFilterTokens(tokens: FilterToken[]): void {
    for (const token of tokens) {
      switch (token.type) {
        case "property":
          // Check if it's a known OData function
          if (
            !ALLOWED_OPERATORS.has(token.value.toLowerCase()) &&
            !this.allowedProperties.has(token.value)
          ) {
            throw new Error(
              `Invalid property in filter: ${token.value}. Allowed properties: ${Array.from(this.allowedProperties).join(", ")}`,
            );
          }
          break;

        case "operator":
          // Validate operator format (both symbols and OData operators)
          if (
            !/^[<>=!]+$/.test(token.value) &&
            !ALLOWED_OPERATORS.has(token.value.toLowerCase())
          ) {
            throw new Error(`Invalid operator: ${token.value}`);
          }
          break;

        case "logical":
          if (!["and", "or", "not"].includes(token.value)) {
            throw new Error(`Invalid logical operator: ${token.value}`);
          }
          break;
      }
    }
  }

  /**
   * Converts validated OData filter tokens to CDS filter syntax
   */
  private convertToCdsFilter(tokens: FilterToken[]): string {
    const cdsTokens: string[] = [];

    for (const token of tokens) {
      switch (token.type) {
        case "operator":
          // Convert OData operators to CDS operators
          switch (token.value.toLowerCase()) {
            case "eq":
              cdsTokens.push("=");
              break;
            case "ne":
              cdsTokens.push("!=");
              break;
            case "gt":
              cdsTokens.push(">");
              break;
            case "ge":
              cdsTokens.push(">=");
              break;
            case "lt":
              cdsTokens.push("<");
              break;
            case "le":
              cdsTokens.push("<=");
              break;
            default:
              cdsTokens.push(token.value);
          }
          break;
        default:
          cdsTokens.push(token.value);
      }
    }

    return cdsTokens.join(" ");
  }
}

/**
 * Filter token interface
 */
interface FilterToken {
  type: "property" | "operator" | "logical" | "paren" | "literal";
  value: string;
}

/**
 * Validation error for OData parameters
 */
export class ODataValidationError extends Error {
  constructor(
    message: string,
    public readonly parameter: string,
    public readonly value: string,
  ) {
    super(message);
    this.name = "ODataValidationError";
  }
}
