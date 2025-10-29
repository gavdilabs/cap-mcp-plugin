import {
  McpAnnotationPrompt,
  McpResourceOption,
  McpAnnotationWrap,
  McpRestriction,
  McpElicit,
} from "./types";

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
  /** Auth roles by providing CDS that is required for use */
  protected readonly _restrictions: McpRestriction[];
  /** Property hints to be used for inputs */
  protected readonly _propertyHints: Map<string, string>;

  /**
   * Creates a new MCP annotation instance
   * @param name - Unique identifier for this annotation
   * @param description - Human-readable description
   * @param target - The target element this annotation applies to
   * @param serviceName - Name of the associated CAP service
   * @param restrictions - Roles required for the given annotation
   */
  constructor(
    name: string,
    description: string,
    target: string,
    serviceName: string,
    restrictions: McpRestriction[],
    propertyHints: Map<string, string>,
  ) {
    this._name = name;
    this._description = description;
    this._target = target;
    this._serviceName = serviceName;
    this._restrictions = restrictions;
    this._propertyHints = propertyHints;
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

  /**
   * Gets the list of roles required for access to the annotation.
   * If the list is empty, then all can access.
   * @returns List of required roles
   */
  get restrictions(): McpRestriction[] {
    return this._restrictions;
  }

  /**
   * Gets a map of possible property hints to be used for resource/tool properties.
   * @returns Map of property hints
   */
  get propertyHints(): Map<string, string> {
    return this._propertyHints;
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
  /** Optional wrapper configuration to expose this resource as tools */
  private readonly _wrap?: McpAnnotationWrap;
  /** Map of foreign keys property -> associated entity */
  private readonly _foreignKeys: Map<string, string>;
  /** Set of computed field names */
  private readonly _computedFields?: Set<string>;

  /**
   * Creates a new MCP resource annotation
   * @param name - Unique identifier for this resource
   * @param description - Human-readable description
   * @param target - The CAP entity this resource represents
   * @param serviceName - Name of the associated CAP service
   * @param functionalities - Set of enabled OData query options (filter, top, skip, etc.)
   * @param properties - Map of entity properties to their CDS types
   * @param resourceKeys - Map of key fields to their types
   * @param foreignKeys - Map of foreign keys used by entity
   * @param wrap - Wrap usage
   * @param restrictions - Optional restrictions based on CDS roles
   * @param computedFields - Optional set of fields that are computed and should be ignored in create scenarios
   * @param propertyHints - Optional map of hints for specific properties on resource
   */
  constructor(
    name: string,
    description: string,
    target: string,
    serviceName: string,
    functionalities: Set<McpResourceOption>,
    properties: Map<string, string>,
    resourceKeys: Map<string, string>,
    foreignKeys: Map<string, string>,
    wrap?: McpAnnotationWrap,
    restrictions?: McpRestriction[],
    computedFields?: Set<string>,
    propertyHints?: Map<string, string>,
  ) {
    super(
      name,
      description,
      target,
      serviceName,
      restrictions ?? [],
      propertyHints ?? new Map(),
    );

    this._functionalities = functionalities;
    this._properties = properties;
    this._resourceKeys = resourceKeys;
    this._wrap = wrap;
    this._foreignKeys = foreignKeys;
    this._computedFields = computedFields;
  }

  /**
   * Gets the set of enabled OData query functionalities
   * @returns Set of available query options like 'filter', 'top', 'skip'
   */
  get functionalities(): Set<McpResourceOption> {
    return this._functionalities;
  }

  /**
   * Gets the map of foreign keys used withing the resource
   * @returns Map of foreign keys - property name -> associated entity
   */
  get foreignKeys(): Map<string, string> {
    return this._foreignKeys;
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

  /**
   * Gets the wrapper configuration for exposing this resource as tools
   */
  get wrap(): McpAnnotationWrap | undefined {
    return this._wrap;
  }

  /**
   * Gets the computed fields if any are available
   */
  get computedFields(): Set<string> | undefined {
    return this._computedFields;
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
  /** Elicited user input object */
  private readonly _elicits?: McpElicit[];

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
   * @param restrictions - Optional restrictions based on CDS roles
   * @param elicits - Optional elicited input requirement
   * @param propertyHints - Optional map of property hints for tool inputs
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
    restrictions?: McpRestriction[],
    elicits?: McpElicit[],
    propertyHints?: Map<string, string>,
  ) {
    super(
      name,
      description,
      operation,
      serviceName,
      restrictions ?? [],
      propertyHints ?? new Map(),
    );

    this._parameters = parameters;
    this._entityKey = entityKey;
    this._operationKind = operationKind;
    this._keyTypeMap = keyTypeMap;
    this._elicits = elicits;
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

  /**
   * Gets the elicited user input if any is required for the tool
   * @returns Elicited user input object
   */
  get elicits(): McpElicit[] | undefined {
    return this._elicits;
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
    super(name, description, serviceName, serviceName, [], new Map());
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
