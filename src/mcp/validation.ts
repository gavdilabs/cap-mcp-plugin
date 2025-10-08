import { z } from "zod";
import { LOGGER } from "../logger";

/**
 * Comprehensive validation system for OData query parameters with security controls
 * Provides schema validation, injection attack prevention, and type safety
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
      /^[a-zA-Z_][a-zA-Z0-9_]*(?:\s+(asc|desc))?(?:\s*,\s*[a-zA-Z_][a-zA-Z0-9_]*(?:\s+(asc|desc))?)*$/i,
    ),
  filter: z.string().min(1).max(1000),
};

/**
 * Validates and sanitizes OData query parameters with comprehensive security checks
 * Prevents injection attacks, validates property references, and ensures type safety
 */
export class ODataQueryValidator {
  private allowedProperties: Set<string>;
  private allowedTypes: Map<string, string>;

  /**
   * Creates a new OData query validator for a specific entity
   * @param properties - Map of allowed entity properties to their CDS types
   */
  constructor(properties: Map<string, string>) {
    this.allowedProperties = new Set(properties.keys());
    this.allowedTypes = new Map(properties);
  }

  /**
   * Validates and parses the $top query parameter
   * @param value - String value of the $top parameter
   * @returns Validated integer value between 1 and 1000
   * @throws Error if value is invalid or out of range
   */
  validateTop(value: string): number {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || !Number.isInteger(parsed)) {
      throw new Error(`Invalid top parameter: ${value}`);
    }
    return ODataQueryValidationSchemas.top.parse(parsed);
  }

  /**
   * Validates and parses the $skip query parameter
   * @param value - String value of the $skip parameter
   * @returns Validated non-negative integer value
   * @throws Error if value is invalid or negative
   */
  validateSkip(value: string): number {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || !Number.isInteger(parsed)) {
      throw new Error(`Invalid skip parameter: ${value}`);
    }
    return ODataQueryValidationSchemas.skip.parse(parsed);
  }

  /**
   * Validates and sanitizes the $select query parameter
   * @param value - Comma-separated list of property names
   * @returns Array of validated property names
   * @throws Error if any property is invalid or not allowed
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
   * Validates and sanitizes the $orderby query parameter
   * @param value - Order by clause with property names and optional asc/desc
   * @returns Validated order by string
   * @throws Error if any property is invalid or not allowed
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
   * Validates and sanitizes the $filter query parameter with comprehensive security checks
   * Prevents injection attacks, validates operators and property references
   * @param value - OData filter expression
   * @returns Sanitized filter string in CDS syntax
   * @throws Error if filter contains forbidden patterns or invalid syntax
   */
  validateFilter(value: string): string {
    const input = value?.replace("filter=", "");

    if (!input || input.trim().length === 0) {
      throw new Error("Filter parameter cannot be empty");
    }

    const decoded = decodeURIComponent(input);
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
   * Parses OData filter expression and validates all components
   * @param filter - Decoded and pre-validated filter string
   * @returns CDS-compatible filter expression
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
   * Tokenizes filter expression into structured components for validation
   * @param filter - Filter string to tokenize
   * @returns Array of typed tokens representing the filter structure
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
   * Validates all filter tokens against allowed properties and operators
   * @param tokens - Array of parsed filter tokens to validate
   * @throws Error if any token contains invalid properties or operators
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
   * Converts validated OData filter tokens to CDS-compatible filter syntax
   * @param tokens - Array of validated filter tokens
   * @returns CDS filter expression string
   */
  private convertToCdsFilter(tokens: FilterToken[]): string {
    const cdsTokens: string[] = [];

    for (const token of tokens) {
      if (token.type === "operator") {
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
            break;
        }
      } else {
        cdsTokens.push(token.value);
        continue;
      }
    }

    return cdsTokens.join(" ");
  }
}

/**
 * Represents a single token in a parsed OData filter expression
 */
interface FilterToken {
  type: "property" | "operator" | "logical" | "paren" | "literal";
  value: string;
}

/**
 * Specialized error class for OData query parameter validation failures
 * Provides additional context about which parameter and value caused the error
 */
export class ODataValidationError extends Error {
  /**
   * Creates a new OData validation error
   * @param message - Error description
   * @param parameter - Name of the parameter that failed validation
   * @param value - The invalid value that caused the error
   */
  constructor(
    message: string,
    public readonly parameter: string,
    public readonly value: string,
  ) {
    super(message);
    this.name = "ODataValidationError";
  }
}
