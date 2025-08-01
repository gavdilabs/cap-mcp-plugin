import { McpAnnotationPrompt, McpResourceOption } from "./types";

/**
 * Base class for all MCP annotations that provides common properties
 * and functionality shared across different annotation types
 */
export class McpAnnotation {
  /** The name identifier for this annotation */
  protected readonly _name: string;
  /** AI agent readable description of what this annotation represents */
  protected readonly _description: string;
  /** The target entity, function, or service element this annotation applies to */
  protected readonly _target: string;
  /** The name of the CAP service this annotation belongs to */
  protected readonly _serviceName: string;

  /**
   * Creates a new MCP annotation instance
   * @param name - Unique identifier for this annotation
   * @param description - Human-readable description
   * @param target - The target element this annotation applies to
   * @param serviceName - Name of the associated CAP service
   */
  constructor(
    name: string,
    description: string,
    target: string,
    serviceName: string,
  ) {
    this._name = name;
    this._description = description;
    this._target = target;
    this._serviceName = serviceName;
  }

  /**
   * Gets the unique name identifier for this annotation
   * @returns The annotation name
   */
  get name(): string {
    return this._name;
  }

  /**
   * Gets the human-readable description of this annotation
   * @returns The annotation description
   */
  get description(): string {
    return this._description;
  }

  /**
   * Gets the target element this annotation applies to
   * @returns The target identifier
   */
  get target(): string {
    return this._target;
  }

  /**
   * Gets the name of the CAP service this annotation belongs to
   * @returns The service name
   */
  get serviceName(): string {
    return this._serviceName;
  }
}

/**
 * Annotation class for MCP resources that can be queried with OData parameters
 * Extends the base annotation with resource-specific configuration
 */
export class McpResourceAnnotation extends McpAnnotation {
  /** Set of OData query functionalities enabled for this resource */
  private readonly _functionalities: Set<McpResourceOption>;
  /** Map of property names to their CDS types for validation */
  private readonly _properties: Map<string, string>;
  /** Map of resource key fields to their types */
  private readonly _resourceKeys: Map<string, string>;

  /**
   * Creates a new MCP resource annotation
   * @param name - Unique identifier for this resource
   * @param description - Human-readable description
   * @param target - The CAP entity this resource represents
   * @param serviceName - Name of the associated CAP service
   * @param functionalities - Set of enabled OData query options (filter, top, skip, etc.)
   * @param properties - Map of entity properties to their CDS types
   * @param resourceKeys - Map of key fields to their types
   */
  constructor(
    name: string,
    description: string,
    target: string,
    serviceName: string,
    functionalities: Set<McpResourceOption>,
    properties: Map<string, string>,
    resourceKeys: Map<string, string>,
  ) {
    super(name, description, target, serviceName);
    this._functionalities = functionalities;
    this._properties = properties;
    this._resourceKeys = resourceKeys;
  }

  /**
   * Gets the set of enabled OData query functionalities
   * @returns Set of available query options like 'filter', 'top', 'skip'
   */
  get functionalities(): Set<McpResourceOption> {
    return this._functionalities;
  }

  /**
   * Gets the map of entity properties to their CDS types
   * @returns Map of property names to type strings
   */
  get properties(): Map<string, string> {
    return this._properties;
  }

  /**
   * Gets the map of resource key fields to their types
   * @returns Map of key field names to type strings
   */
  get resourceKeys(): Map<string, string> {
    return this._resourceKeys;
  }
}

/**
 * Annotation class for MCP tools that represent executable CAP functions or actions
 * Can be either bound (entity-level) or unbound (service-level) operations
 */
export class McpToolAnnotation extends McpAnnotation {
  /** Map of function parameters to their CDS types */
  private readonly _parameters?: Map<string, string>;
  /** Entity key field name for bound operations */
  private readonly _entityKey?: string;
  /** Type of operation: 'function' or 'action' */
  private readonly _operationKind?: string;
  /** Map of key field names to their types for bound operations */
  private readonly _keyTypeMap?: Map<string, string>;

  /**
   * Creates a new MCP tool annotation
   * @param name - Unique identifier for this tool
   * @param description - Human-readable description
   * @param operation - The CAP function or action name
   * @param serviceName - Name of the associated CAP service
   * @param parameters - Optional map of function parameters to their types
   * @param entityKey - Optional entity key field for bound operations
   * @param operationKind - Optional operation type ('function' or 'action')
   * @param keyTypeMap - Optional map of key fields to types for bound operations
   */
  constructor(
    name: string,
    description: string,
    operation: string,
    serviceName: string,
    parameters?: Map<string, string>,
    entityKey?: string,
    operationKind?: string,
    keyTypeMap?: Map<string, string>,
  ) {
    super(name, description, operation, serviceName);
    this._parameters = parameters;
    this._entityKey = entityKey;
    this._operationKind = operationKind;
    this._keyTypeMap = keyTypeMap;
  }

  /**
   * Gets the map of function parameters to their CDS types
   * @returns Map of parameter names to type strings, or undefined if no parameters
   */
  get parameters(): Map<string, string> | undefined {
    return this._parameters;
  }

  /**
   * Gets the entity key field name for bound operations
   * @returns Entity key field name, or undefined for unbound operations
   */
  get entityKey(): string | undefined {
    return this._entityKey;
  }

  /**
   * Gets the operation kind (function or action)
   * @returns Operation type string, or undefined if not specified
   */
  get operationKind(): string | undefined {
    return this._operationKind;
  }

  /**
   * Gets the map of key field names to their types for bound operations
   * @returns Map of key fields to types, or undefined for unbound operations
   */
  get keyTypeMap(): Map<string, string> | undefined {
    return this._keyTypeMap;
  }
}

/**
 * Annotation class for MCP prompts that define reusable prompt templates
 * Applied at the service level to provide prompt templates with variable substitution
 */
export class McpPromptAnnotation extends McpAnnotation {
  /** Array of prompt template definitions */
  private readonly _prompts: McpAnnotationPrompt[];

  /**
   * Creates a new MCP prompt annotation
   * @param name - Unique identifier for this prompt collection
   * @param description - Human-readable description
   * @param serviceName - Name of the associated CAP service
   * @param prompts - Array of prompt template definitions
   */
  constructor(
    name: string,
    description: string,
    serviceName: string,
    prompts: McpAnnotationPrompt[],
  ) {
    super(name, description, serviceName, serviceName);
    this._prompts = prompts;
  }

  /**
   * Gets the array of prompt template definitions
   * @returns Array of prompt templates with their inputs and templates
   */
  get prompts(): McpAnnotationPrompt[] {
    return this._prompts;
  }
}
