import {
  McpAnnotation,
  McpResourceAnnotation,
  McpToolAnnotation,
  McpPromptAnnotation,
} from "../../../src/annotations/structures";
import {
  McpResourceOption,
  McpAnnotationPrompt,
  McpRestriction,
} from "../../../src/annotations/types";

describe("McpAnnotation", () => {
  let annotation: McpAnnotation;

  beforeEach(() => {
    annotation = new McpAnnotation(
      "test-name",
      "test-description",
      "test-target",
      "test-service",
      [],
    );
  });

  test("should create instance with correct properties", () => {
    expect(annotation.name).toBe("test-name");
    expect(annotation.description).toBe("test-description");
    expect(annotation.target).toBe("test-target");
    expect(annotation.serviceName).toBe("test-service");
    expect(annotation.restrictions).toEqual([]);
  });

  test("should handle empty strings", () => {
    const emptyAnnotation = new McpAnnotation("", "", "", "", []);
    expect(emptyAnnotation.name).toBe("");
    expect(emptyAnnotation.description).toBe("");
    expect(emptyAnnotation.target).toBe("");
    expect(emptyAnnotation.serviceName).toBe("");
    expect(emptyAnnotation.restrictions).toEqual([]);
  });

  test("should create instance with restrictions", () => {
    const restrictions: McpRestriction[] = [
      { role: "admin", operations: ["READ", "UPDATE"] },
      { role: "user", operations: ["READ"] },
    ];
    const annotationWithRestrictions = new McpAnnotation(
      "test-name",
      "test-description",
      "test-target",
      "test-service",
      restrictions,
    );
    expect(annotationWithRestrictions.restrictions).toEqual(restrictions);
  });
});

describe("McpResourceAnnotation", () => {
  let functionalities: Set<McpResourceOption>;
  let properties: Map<string, string>;
  let resourceKeys: Map<string, string>;
  let annotation: McpResourceAnnotation;

  beforeEach(() => {
    functionalities = new Set(["filter", "orderby"]);
    properties = new Map([
      ["prop1", "String"],
      ["prop2", "Integer"],
    ]);
    resourceKeys = new Map([["key1", "UUID"]]);
    annotation = new McpResourceAnnotation(
      "resource-name",
      "resource-description",
      "resource-target",
      "resource-service",
      functionalities,
      properties,
      resourceKeys,
    );
  });

  test("should create instance with correct properties", () => {
    expect(annotation.name).toBe("resource-name");
    expect(annotation.description).toBe("resource-description");
    expect(annotation.target).toBe("resource-target");
    expect(annotation.serviceName).toBe("resource-service");
    expect(annotation.functionalities).toBe(functionalities);
    expect(annotation.properties).toBe(properties);
    expect(annotation.resourceKeys).toBe(resourceKeys);
  });

  test("should handle empty collections", () => {
    const emptyAnnotation = new McpResourceAnnotation(
      "name",
      "desc",
      "target",
      "service",
      new Set(),
      new Map(),
      new Map(),
    );
    expect(emptyAnnotation.functionalities.size).toBe(0);
    expect(emptyAnnotation.properties.size).toBe(0);
    expect(emptyAnnotation.resourceKeys.size).toBe(0);
  });

  test("should create resource annotation with restrictions", () => {
    const restrictions: McpRestriction[] = [
      { role: "read-role", operations: ["READ"] },
    ];
    const annotationWithRestrictions = new McpResourceAnnotation(
      "resource-name",
      "resource-description",
      "resource-target",
      "resource-service",
      new Set(["filter"]),
      new Map([["id", "UUID"]]),
      new Map([["id", "UUID"]]),
      undefined,
      restrictions,
    );
    expect(annotationWithRestrictions.restrictions).toEqual(restrictions);
  });
});

describe("McpToolAnnotation", () => {
  test("should create instance with all parameters", () => {
    const parameters = new Map([["param1", "String"]]);
    const keyTypeMap = new Map([["key1", "UUID"]]);

    const annotation = new McpToolAnnotation(
      "tool-name",
      "tool-description",
      "tool-operation",
      "tool-service",
      parameters,
      "entity-key",
      "function",
      keyTypeMap,
    );

    expect(annotation.name).toBe("tool-name");
    expect(annotation.description).toBe("tool-description");
    expect(annotation.target).toBe("tool-operation");
    expect(annotation.serviceName).toBe("tool-service");
    expect(annotation.parameters).toBe(parameters);
    expect(annotation.entityKey).toBe("entity-key");
    expect(annotation.operationKind).toBe("function");
    expect(annotation.keyTypeMap).toBe(keyTypeMap);
  });

  test("should create instance with minimal parameters", () => {
    const annotation = new McpToolAnnotation(
      "tool-name",
      "tool-description",
      "tool-operation",
      "tool-service",
    );

    expect(annotation.name).toBe("tool-name");
    expect(annotation.description).toBe("tool-description");
    expect(annotation.parameters).toBeUndefined();
    expect(annotation.entityKey).toBeUndefined();
    expect(annotation.operationKind).toBeUndefined();
    expect(annotation.keyTypeMap).toBeUndefined();
  });

  test("should create tool annotation with restrictions", () => {
    const restrictions: McpRestriction[] = [{ role: "author-specialist" }];
    const annotation = new McpToolAnnotation(
      "tool-name",
      "tool-description",
      "tool-operation",
      "tool-service",
      undefined,
      undefined,
      undefined,
      undefined,
      restrictions,
    );
    expect(annotation.restrictions).toEqual(restrictions);
  });
});

describe("McpPromptAnnotation", () => {
  test("should create instance with prompts", () => {
    const prompts: McpAnnotationPrompt[] = [
      {
        name: "prompt1",
        title: "Prompt 1",
        description: "Description 1",
        template: "Template 1",
        role: "user",
        inputs: [{ key: "input1", type: "String" }],
      },
    ];

    const annotation = new McpPromptAnnotation(
      "prompt-name",
      "prompt-description",
      "prompt-service",
      prompts,
    );

    expect(annotation.name).toBe("prompt-name");
    expect(annotation.description).toBe("prompt-description");
    expect(annotation.target).toBe("prompt-service");
    expect(annotation.serviceName).toBe("prompt-service");
    expect(annotation.prompts).toBe(prompts);
  });

  test("should handle empty prompts array", () => {
    const annotation = new McpPromptAnnotation(
      "prompt-name",
      "prompt-description",
      "prompt-service",
      [],
    );

    expect(annotation.prompts).toEqual([]);
  });
});
