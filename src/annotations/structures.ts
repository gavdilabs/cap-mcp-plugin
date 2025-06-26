import { McpAnnotationPrompt, McpResourceOption } from "./types";

export class McpAnnotation {
  protected readonly _name: string;
  protected readonly _description: string;
  protected readonly _target: string;
  protected readonly _serviceName: string;

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

  get name(): string {
    return this._name;
  }

  get description(): string {
    return this._description;
  }

  get target(): string {
    return this._target;
  }

  get serviceName(): string {
    return this._serviceName;
  }
}

export class McpResourceAnnotation extends McpAnnotation {
  private readonly _functionalities: Set<McpResourceOption>;
  private readonly _properties: Map<string, string>;
  private readonly _resourceKeys: Map<string, string>;

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

  get functionalities(): Set<McpResourceOption> {
    return this._functionalities;
  }

  get properties(): Map<string, string> {
    return this._properties;
  }

  get resourceKeys(): Map<string, string> {
    return this._resourceKeys;
  }
}

export class McpToolAnnotation extends McpAnnotation {
  private readonly _parameters?: Map<string, string>;
  private readonly _entityKey?: string;
  private readonly _operationKind?: string;
  private readonly _keyTypeMap?: Map<string, string>;

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

  get parameters(): Map<string, string> | undefined {
    return this._parameters;
  }

  get entityKey(): string | undefined {
    return this._entityKey;
  }

  get operationKind(): string | undefined {
    return this._operationKind;
  }

  get keyTypeMap(): Map<string, string> | undefined {
    return this._keyTypeMap;
  }
}

export class McpPromptAnnotation extends McpAnnotation {
  private readonly _prompts: McpAnnotationPrompt[];

  constructor(
    name: string,
    description: string,
    serviceName: string,
    prompts: McpAnnotationPrompt[],
  ) {
    super(name, description, serviceName, serviceName);
    this._prompts = prompts;
  }

  get prompts(): McpAnnotationPrompt[] {
    return this._prompts;
  }
}
