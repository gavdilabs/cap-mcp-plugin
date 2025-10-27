import { csn } from "@sap/cds";
import {
  splitDefinitionName,
  containsMcpAnnotation,
  containsRequiredAnnotations,
  containsRequiredElicitedParams,
  isValidResourceAnnotation,
  isValidToolAnnotation,
  isValidPromptsAnnotation,
  determineResourceOptions,
  parseResourceElements,
  parseOperationElements,
  parseEntityKeys,
  parseCdsRestrictions,
} from "../../../src/annotations/utils";
import {
  McpAnnotationStructure,
  McpResourceOption,
  CdsRestriction,
} from "../../../src/annotations/types";

// Mock logger
jest.mock("../../../src/logger", () => ({
  LOGGER: {
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("Utils", () => {
  describe("splitDefinitionName", () => {
    test("should split definition name correctly", () => {
      const result = splitDefinitionName("ServiceName.EntityName");
      expect(result.serviceName).toBe("ServiceName");
      expect(result.target).toBe("EntityName");
    });

    test("should handle single part definition", () => {
      const result = splitDefinitionName("ServiceName");
      expect(result.serviceName).toBe("ServiceName");
      expect(result.target).toBe("");
    });

    test("should handle two part definition", () => {
      const result = splitDefinitionName("ServiceName.Entity");
      expect(result.serviceName).toBe("ServiceName");
      expect(result.target).toBe("Entity");
    });

    test("should handle multiple dots", () => {
      const result = splitDefinitionName("Service.Sub.Entity");
      expect(result.serviceName).toBe("Service.Sub");
      expect(result.target).toBe("Entity");
    });

    test("should throw error when given empty string", () => {
      try {
        splitDefinitionName("");
      } catch (e) {
        expect(e).toBeDefined();
        expect((e as Error).message).toBe(
          "Invalid definition name. Cannot be split",
        );
      }
    });
  });

  describe("containsMcpAnnotation", () => {
    test("should return true when MCP annotation exists", () => {
      const definition = {
        "@mcp.name": "test",
        kind: "entity",
      } as any as csn.Definition;

      expect(containsMcpAnnotation(definition)).toBe(true);
    });

    test("should return false when no MCP annotation exists", () => {
      const definition = {
        kind: "entity",
        target: "test",
      } as csn.Definition;

      expect(containsMcpAnnotation(definition)).toBe(false);
    });

    test("should return true for any @mcp annotation", () => {
      const definition = {
        "@mcp.description": "test description",
        kind: "entity",
      } as any as csn.Definition;

      expect(containsMcpAnnotation(definition)).toBe(true);
    });
  });

  describe("containsRequiredAnnotations", () => {
    test("should return true for service kind", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        definition: { kind: "service" } as csn.Definition,
      };

      expect(containsRequiredAnnotations(annotations)).toBe(true);
    });

    test("should return true for valid annotations", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        definition: { kind: "entity" } as csn.Definition,
        name: "test-name",
        description: "test-description",
      };

      expect(containsRequiredAnnotations(annotations)).toBe(true);
    });

    test("should throw error for missing name", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        definition: { kind: "entity", target: "TestEntity" } as csn.Definition,
        description: "test-description",
      };

      expect(() => containsRequiredAnnotations(annotations)).toThrow(
        "Invalid annotation 'TestEntity' - Missing required property 'name'",
      );
    });

    test("should throw error for empty name", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        definition: { kind: "entity", target: "TestEntity" } as csn.Definition,
        name: "",
        description: "test-description",
      };

      expect(() => containsRequiredAnnotations(annotations)).toThrow(
        "Invalid annotation 'TestEntity' - Missing required property 'name'",
      );
    });

    test("should throw error for missing description", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        definition: { kind: "entity" } as csn.Definition,
        name: "test-name",
      };

      expect(() => containsRequiredAnnotations(annotations)).toThrow(
        "Invalid annotation - Missing required property 'description'",
      );
    });
  });

  describe("isValidResourceAnnotation", () => {
    test("should return true for boolean resource annotation", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        definition: { kind: "entity", target: "TestEntity" } as csn.Definition,
        resource: true,
      };

      expect(isValidResourceAnnotation(annotations)).toBe(true);
    });

    test("should return true for valid array resource annotation", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        definition: { kind: "entity", target: "TestEntity" } as csn.Definition,
        resource: ["filter", "orderby"],
      };

      expect(isValidResourceAnnotation(annotations)).toBe(true);
    });

    test("should throw error for missing resource annotation", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        definition: { kind: "entity", target: "TestEntity" } as csn.Definition,
      };

      expect(() => isValidResourceAnnotation(annotations)).toThrow(
        "Invalid annotation 'TestEntity' - Missing required flag 'resource'",
      );
    });

    test("should throw error for invalid resource option", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        definition: { kind: "entity", target: "TestEntity" } as csn.Definition,
        resource: ["filter", "invalid-option"] as McpResourceOption[],
      };

      expect(() => isValidResourceAnnotation(annotations)).toThrow(
        "Invalid annotation 'TestEntity' - Invalid resource option: invalid-option",
      );
    });
  });

  describe("isValidToolAnnotation", () => {
    test("should return true for valid tool annotation", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        definition: {
          kind: "function",
          target: "TestFunction",
        } as csn.Definition,
        tool: true,
      };

      expect(isValidToolAnnotation(annotations)).toBe(true);
    });

    test("should throw error for missing tool annotation", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        definition: {
          kind: "function",
          target: "TestFunction",
        } as csn.Definition,
      };

      expect(() => isValidToolAnnotation(annotations)).toThrow(
        "Invalid annotation 'TestFunction' - Missing required flag 'tool'",
      );
    });
  });

  describe("isValidPromptsAnnotation", () => {
    test("should return true for valid prompts annotation", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        definition: {
          kind: "service",
          target: "TestService",
        } as csn.Definition,
        prompts: [
          {
            name: "test-prompt",
            title: "Test Prompt",
            description: "Test Description",
            template: "Test Template",
            role: "user",
            inputs: [{ key: "input1", type: "String" }],
          },
        ],
      };

      expect(isValidPromptsAnnotation(annotations)).toBe(true);
    });

    test("should throw error for missing prompts", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        definition: {
          kind: "service",
          target: "TestService",
        } as csn.Definition,
      };

      expect(() => isValidPromptsAnnotation(annotations)).toThrow(
        "Invalid annotation 'TestService' - Missing prompts annotations",
      );
    });

    test("should throw error for prompt missing template", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        definition: {
          kind: "service",
          target: "TestService",
        } as csn.Definition,
        prompts: [
          {
            name: "test-prompt",
            title: "Test Prompt",
            description: "Test Description",
            template: "",
            role: "user",
          },
        ],
      };

      expect(() => isValidPromptsAnnotation(annotations)).toThrow(
        "Invalid annotation 'TestService' - Missing valid template",
      );
    });

    test("should throw error for invalid role", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        definition: {
          kind: "service",
          target: "TestService",
        } as csn.Definition,
        prompts: [
          {
            name: "test-prompt",
            title: "Test Prompt",
            description: "Test Description",
            template: "Test Template",
            role: "invalid-role" as any,
          },
        ],
      };

      expect(() => isValidPromptsAnnotation(annotations)).toThrow(
        "Invalid annotation 'TestService' - Role must be 'user' or 'assistant'",
      );
    });

    test("should throw error for input missing key", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        definition: {
          kind: "service",
          target: "TestService",
        } as csn.Definition,
        prompts: [
          {
            name: "test-prompt",
            title: "Test Prompt",
            description: "Test Description",
            template: "Test Template",
            role: "user",
            inputs: [{ key: "", type: "String" }],
          },
        ],
      };

      expect(() => isValidPromptsAnnotation(annotations)).toThrow(
        "Invalid annotation 'TestService' - missing input key",
      );
    });
  });

  describe("determineResourceOptions", () => {
    test("should return default options for boolean resource", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        resource: true,
      };

      const result = determineResourceOptions(annotations);
      expect(result.size).toBe(5);
      expect(result.has("filter")).toBe(true);
      expect(result.has("orderby")).toBe(true);
    });

    test("should return specific options for array resource", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        resource: ["filter", "orderby"],
      };

      const result = determineResourceOptions(annotations);
      expect(result.size).toBe(2);
      expect(result.has("filter")).toBe(true);
      expect(result.has("orderby")).toBe(true);
      expect(result.has("select")).toBe(false);
    });
  });

  describe("parseResourceElements", () => {
    test("should parse resource elements correctly", () => {
      const definition = {
        elements: {
          id: { type: "cds.UUID", key: true },
          name: { type: "cds.String" },
          count: { type: "cds.Integer" },
        },
      } as any as csn.Definition;

      const mockModel: csn.CSN = {
        definitions: {},
      };

      const result = parseResourceElements(definition, mockModel);

      expect(result.properties.size).toBe(3);
      expect(result.properties.get("id")).toBe("UUID");
      expect(result.properties.get("name")).toBe("String");
      expect(result.properties.get("count")).toBe("Integer");

      expect(result.resourceKeys.size).toBe(1);
      expect(result.resourceKeys.get("id")).toBe("UUID");
    });

    test("should handle elements without type gracefully", () => {
      const definition = {
        elements: {
          id: { type: "cds.UUID", key: true },
          name: { type: "cds.String" },
          invalidElement: { key: true }, // This should be ignored as it has no type
        },
      } as any as csn.Definition;

      const mockModel: csn.CSN = {
        definitions: {},
      };

      // The function should handle elements without type gracefully
      // Currently, it will attempt to parse all elements, so we expect it to fail for elements without type
      expect(() => parseResourceElements(definition, mockModel)).toThrow(
        "Failed to parse nested type reference",
      );
    });

    test("should handle elements with valid types only", () => {
      const definition = {
        elements: {
          id: { type: "cds.UUID", key: true },
          name: { type: "cds.String" },
        },
      } as any as csn.Definition;

      const mockModel: csn.CSN = {
        definitions: {},
      };

      const result = parseResourceElements(definition, mockModel);

      expect(result.properties.size).toBe(2);
      expect(result.properties.get("id")).toBe("UUID");
      expect(result.properties.get("name")).toBe("String");
      expect(result.resourceKeys.size).toBe(1);
      expect(result.resourceKeys.get("id")).toBe("UUID");
    });

    test("should parse array types correctly", () => {
      const definition = {
        elements: {
          id: { type: "cds.UUID", key: true },
          tags: { items: { type: "cds.String" } },
          scores: { items: { type: "cds.Integer" }, key: true },
          flags: { items: { type: "cds.Boolean" } },
        },
      } as any as csn.Definition;

      const mockModel: csn.CSN = {
        definitions: {},
      };

      const result = parseResourceElements(definition, mockModel);

      expect(result.properties.size).toBe(4);
      expect(result.properties.get("id")).toBe("UUID");
      expect(result.properties.get("tags")).toBe("StringArray");
      expect(result.properties.get("scores")).toBe("IntegerArray");
      expect(result.properties.get("flags")).toBe("BooleanArray");

      expect(result.resourceKeys.size).toBe(2);
      expect(result.resourceKeys.get("id")).toBe("UUID");
      expect(result.resourceKeys.get("scores")).toBe("IntegerArray");
    });

    test("should parse typed references correctly", () => {
      const definition = {
        elements: {
          id: { type: "cds.UUID", key: true },
          authorName: { type: { ref: ["Author", "name"] } },
          publisherInfo: { type: { ref: ["Publisher", "info"] }, key: true },
        },
      } as any as csn.Definition;

      const mockModel: csn.CSN = {
        definitions: {
          Author: {
            kind: "entity",
            elements: {
              name: { type: "cds.String" } as any,
            },
          } as any,
          Publisher: {
            kind: "entity",
            elements: {
              info: { type: "cds.LargeString" } as any,
            },
          } as any,
        },
      };

      const result = parseResourceElements(definition, mockModel);

      expect(result.properties.size).toBe(3);
      expect(result.properties.get("id")).toBe("UUID");
      expect(result.properties.get("authorName")).toBe("String");
      expect(result.properties.get("publisherInfo")).toBe("LargeString");

      expect(result.resourceKeys.size).toBe(2);
      expect(result.resourceKeys.get("id")).toBe("UUID");
      expect(result.resourceKeys.get("publisherInfo")).toBe("LargeString");
    });

    test("should parse array of typed references correctly", () => {
      const definition = {
        elements: {
          id: { type: "cds.UUID", key: true },
          authorNames: { items: { type: { ref: ["Author", "name"] } } },
          categoryTitles: {
            items: { type: { ref: ["Category", "title"] } },
            key: true,
          },
        },
      } as any as csn.Definition;

      const mockModel: csn.CSN = {
        definitions: {
          Author: {
            kind: "entity",
            elements: {
              name: { type: "cds.String" } as any,
            },
          } as any,
          Category: {
            kind: "entity",
            elements: {
              title: { type: "cds.String" } as any,
            },
          } as any,
        },
      };

      const result = parseResourceElements(definition, mockModel);

      expect(result.properties.size).toBe(3);
      expect(result.properties.get("id")).toBe("UUID");
      expect(result.properties.get("authorNames")).toBe("StringArray");
      expect(result.properties.get("categoryTitles")).toBe("StringArray");

      expect(result.resourceKeys.size).toBe(2);
      expect(result.resourceKeys.get("id")).toBe("UUID");
      expect(result.resourceKeys.get("categoryTitles")).toBe("StringArray");
    });

    test("should handle mixed simple types, arrays, and typed references", () => {
      const definition = {
        elements: {
          id: { type: "cds.UUID", key: true },
          title: { type: "cds.String" },
          tags: { items: { type: "cds.String" } },
          authorName: { type: { ref: ["Author", "name"] } },
          categoryNames: { items: { type: { ref: ["Category", "name"] } } },
          isPublished: { type: "cds.Boolean" },
        },
      } as any as csn.Definition;

      const mockModel: csn.CSN = {
        definitions: {
          Author: {
            kind: "entity",
            elements: {
              name: { type: "cds.String" } as any,
            },
          } as any,
          Category: {
            kind: "entity",
            elements: {
              name: { type: "cds.String" } as any,
            },
          } as any,
        },
      };

      const result = parseResourceElements(definition, mockModel);

      expect(result.properties.size).toBe(6);
      expect(result.properties.get("id")).toBe("UUID");
      expect(result.properties.get("title")).toBe("String");
      expect(result.properties.get("tags")).toBe("StringArray");
      expect(result.properties.get("authorName")).toBe("String");
      expect(result.properties.get("categoryNames")).toBe("StringArray");
      expect(result.properties.get("isPublished")).toBe("Boolean");

      expect(result.resourceKeys.size).toBe(1);
      expect(result.resourceKeys.get("id")).toBe("UUID");
    });

    test("should handle empty elements", () => {
      const definition = {
        elements: {},
      } as any as csn.Definition;

      const mockModel: csn.CSN = {
        definitions: {},
      };

      const result = parseResourceElements(definition, mockModel);

      expect(result.properties.size).toBe(0);
      expect(result.resourceKeys.size).toBe(0);
    });

    test("should handle definition without elements", () => {
      const definition = {} as any as csn.Definition;

      const mockModel: csn.CSN = {
        definitions: {},
      };

      const result = parseResourceElements(definition, mockModel);

      expect(result.properties.size).toBe(0);
      expect(result.resourceKeys.size).toBe(0);
    });
  });

  describe("parseOperationElements", () => {
    test("should parse operation elements correctly", () => {
      const annotations: McpAnnotationStructure = {
        definition: {
          kind: "function",
          params: {
            param1: { type: "cds.String" },
            param2: { type: "cds.Integer" },
          },
        } as any,
        name: "test",
        description: "test",
      };

      const mockModel: csn.CSN = {
        definitions: {},
      };
      const result = parseOperationElements(annotations, mockModel);

      expect(result.parameters).toBeDefined();
      expect(result.parameters!.size).toBe(2);
      expect(result.parameters!.get("param1")).toBe("String");
      expect(result.parameters!.get("param2")).toBe("Integer");
      expect(result.operationKind).toBe("function");
    });

    test("should parse array parameters correctly", () => {
      const annotations: McpAnnotationStructure = {
        definition: {
          kind: "function",
          params: {
            stringArray: {
              items: { type: "cds.String" },
            },
            integerArray: {
              items: { type: "cds.Integer" },
            },
            booleanArray: {
              items: { type: "cds.Boolean" },
            },
            uuidArray: {
              items: { type: "cds.UUID" },
            },
          },
        } as any,
        name: "test-array",
        description: "test array parameters",
      };

      const mockModel: csn.CSN = {
        definitions: {},
      };
      const result = parseOperationElements(annotations, mockModel);

      expect(result.parameters).toBeDefined();
      expect(result.parameters!.size).toBe(4);
      expect(result.parameters!.get("stringArray")).toBe("StringArray");
      expect(result.parameters!.get("integerArray")).toBe("IntegerArray");
      expect(result.parameters!.get("booleanArray")).toBe("BooleanArray");
      expect(result.parameters!.get("uuidArray")).toBe("UUIDArray");
      expect(result.operationKind).toBe("function");
    });

    test("should parse mixed array and non-array parameters", () => {
      const annotations: McpAnnotationStructure = {
        definition: {
          kind: "action",
          params: {
            singleString: { type: "cds.String" },
            stringArray: {
              items: { type: "cds.String" },
            },
            singleInteger: { type: "cds.Integer" },
            integerArray: {
              items: { type: "cds.Integer" },
            },
          },
        } as any,
        name: "test-mixed",
        description: "test mixed parameters",
      };

      const mockModel: csn.CSN = {
        definitions: {},
      };
      const result = parseOperationElements(annotations, mockModel);

      expect(result.parameters).toBeDefined();
      expect(result.parameters!.size).toBe(4);
      expect(result.parameters!.get("singleString")).toBe("String");
      expect(result.parameters!.get("stringArray")).toBe("StringArray");
      expect(result.parameters!.get("singleInteger")).toBe("Integer");
      expect(result.parameters!.get("integerArray")).toBe("IntegerArray");
      expect(result.operationKind).toBe("action");
    });

    test("should parse array of complex types", () => {
      const annotations: McpAnnotationStructure = {
        definition: {
          kind: "function",
          params: {
            complexArray: {
              items: {
                type: { ref: ["myTypes.Person", "name"] },
              },
            },
          },
        } as any,
        name: "test-complex-array",
        description: "test complex array parameters",
      };

      const mockModel: csn.CSN = {
        definitions: {
          "myTypes.Person": {
            kind: "type",
            elements: {
              name: { type: "cds.String" } as any,
            },
          } as any,
        },
      };
      const result = parseOperationElements(annotations, mockModel);

      expect(result.parameters).toBeDefined();
      expect(result.parameters!.size).toBe(1);
      expect(result.parameters!.get("complexArray")).toBe("StringArray");
    });

    test("should handle all CDS array types correctly", () => {
      const annotations: McpAnnotationStructure = {
        definition: {
          kind: "function",
          params: {
            dateArray: { items: { type: "cds.Date" } },
            timeArray: { items: { type: "cds.Time" } },
            datetimeArray: { items: { type: "cds.DateTime" } },
            timestampArray: { items: { type: "cds.Timestamp" } },
            decimalArray: { items: { type: "cds.Decimal" } },
            doubleArray: { items: { type: "cds.Double" } },
            int16Array: { items: { type: "cds.Int16" } },
            int32Array: { items: { type: "cds.Int32" } },
            int64Array: { items: { type: "cds.Int64" } },
            uint8Array: { items: { type: "cds.UInt8" } },
            binaryArray: { items: { type: "cds.Binary" } },
            largeBinaryArray: { items: { type: "cds.LargeBinary" } },
            largeStringArray: { items: { type: "cds.LargeString" } },
          },
        } as any,
        name: "test-all-arrays",
        description: "test all array types",
      };

      const mockModel: csn.CSN = {
        definitions: {},
      };
      const result = parseOperationElements(annotations, mockModel);

      expect(result.parameters).toBeDefined();
      expect(result.parameters!.size).toBe(13);
      expect(result.parameters!.get("dateArray")).toBe("DateArray");
      expect(result.parameters!.get("timeArray")).toBe("TimeArray");
      expect(result.parameters!.get("datetimeArray")).toBe("DateTimeArray");
      expect(result.parameters!.get("timestampArray")).toBe("TimestampArray");
      expect(result.parameters!.get("decimalArray")).toBe("DecimalArray");
      expect(result.parameters!.get("doubleArray")).toBe("DoubleArray");
      expect(result.parameters!.get("int16Array")).toBe("Int16Array");
      expect(result.parameters!.get("int32Array")).toBe("Int32Array");
      expect(result.parameters!.get("int64Array")).toBe("Int64Array");
      expect(result.parameters!.get("uint8Array")).toBe("UInt8Array");
      expect(result.parameters!.get("binaryArray")).toBe("BinaryArray");
      expect(result.parameters!.get("largeBinaryArray")).toBe(
        "LargeBinaryArray",
      );
      expect(result.parameters!.get("largeStringArray")).toBe(
        "LargeStringArray",
      );
    });

    test("should handle operation without parameters", () => {
      const annotations: McpAnnotationStructure = {
        definition: {
          kind: "action",
        } as csn.Definition,
        name: "test",
        description: "test",
      };

      const mockModel: csn.CSN = {
        definitions: {},
      };
      const result = parseOperationElements(annotations, mockModel);

      expect(result.parameters).toBeUndefined();
      expect(result.operationKind).toBe("action");
    });
  });

  describe("parseEntityKeys", () => {
    test("should parse entity keys correctly", () => {
      const definition = {
        elements: {
          id: { type: "cds.UUID", key: true },
          name: { type: "cds.String" },
          secondaryId: { type: "cds.String", key: true },
        },
      } as any as csn.Definition;

      const result = parseEntityKeys(definition);

      expect(result.size).toBe(2);
      expect(result.get("id")).toBe("UUID");
      expect(result.get("secondaryId")).toBe("String");
    });

    test("should return empty result if there is no definition object", () => {
      const definition = undefined;
      const result = parseEntityKeys(definition as any);

      expect(result.size).toBe(0);
    });

    test("should return empty result if there is no elements defined in definition", () => {
      const definition = {};
      const result = parseEntityKeys(definition as any);

      expect(result.size).toBe(0);
    });

    test("should throw error for key without type", () => {
      const definition = {
        elements: {
          id: { key: true },
        },
      } as any as csn.Definition;

      expect(() => parseEntityKeys(definition)).toThrow(
        "Invalid key type found for bound operation",
      );
    });
  });

  describe("parseCdsRestrictions", () => {
    test("should return empty array when no restrictions or requires", () => {
      const result = parseCdsRestrictions(undefined, undefined);
      expect(result).toEqual([]);
    });

    test("should parse requires annotation only", () => {
      const result = parseCdsRestrictions(undefined, "admin");
      expect(result).toEqual([{ role: "admin" }]);
    });

    test("should parse simple restriction with specific roles", () => {
      const restrictions: CdsRestriction[] = [
        {
          grant: ["READ", "UPDATE"],
          to: ["maintainer", "admin"],
        },
      ];

      const result = parseCdsRestrictions(restrictions, undefined);
      expect(result).toEqual([
        { role: "maintainer", operations: ["READ", "UPDATE"] },
        { role: "admin", operations: ["READ", "UPDATE"] },
      ]);
    });

    test("should handle restriction without 'to' field", () => {
      const restrictions: CdsRestriction[] = [
        {
          grant: ["READ"],
        },
      ];

      const result = parseCdsRestrictions(restrictions, undefined);
      expect(result).toEqual([
        { role: "authenticated-user", operations: ["READ"] },
      ]);
    });

    test("should map CHANGE to UPDATE operation", () => {
      const restrictions: CdsRestriction[] = [
        {
          grant: ["CHANGE"],
          to: ["editor"],
        },
      ];

      const result = parseCdsRestrictions(restrictions, undefined);
      expect(result).toEqual([{ role: "editor", operations: ["UPDATE"] }]);
    });

    test("should map * to all operations", () => {
      const restrictions: CdsRestriction[] = [
        {
          grant: ["*"],
          to: ["admin"],
        },
      ];

      const result = parseCdsRestrictions(restrictions, undefined);
      expect(result).toEqual([
        { role: "admin", operations: ["CREATE", "READ", "UPDATE", "DELETE"] },
      ]);
    });

    test("should handle empty grant array", () => {
      const restrictions: CdsRestriction[] = [
        {
          grant: [],
          to: ["user"],
        },
      ];

      const result = parseCdsRestrictions(restrictions, undefined);
      expect(result).toEqual([
        { role: "user", operations: ["CREATE", "READ", "UPDATE", "DELETE"] },
      ]);
    });

    test("should combine requires and restrictions", () => {
      const restrictions: CdsRestriction[] = [
        {
          grant: ["READ"],
          to: ["read-role"],
        },
      ];

      const result = parseCdsRestrictions(restrictions, "book-keeper");
      expect(result).toEqual([
        { role: "book-keeper" },
        { role: "read-role", operations: ["READ"] },
      ]);
    });

    test("should handle multiple restrictions", () => {
      const restrictions: CdsRestriction[] = [
        {
          grant: ["READ"],
          to: ["read-role"],
        },
        {
          grant: ["CREATE", "UPDATE"],
          to: ["maintainer"],
        },
        {
          grant: ["*"],
          to: ["admin"],
        },
      ];

      const result = parseCdsRestrictions(restrictions, undefined);
      expect(result).toEqual([
        { role: "read-role", operations: ["READ"] },
        { role: "maintainer", operations: ["CREATE", "UPDATE"] },
        { role: "admin", operations: ["CREATE", "READ", "UPDATE", "DELETE"] },
      ]);
    });

    // Regression tests for GitHub issue #73
    describe("Issue #73: Grant/To combinations", () => {
      test("Scenario 1: Grant as a String, No 'to'", () => {
        const restrictions: CdsRestriction[] = [
          {
            grant: "READ",
          },
        ];

        const result = parseCdsRestrictions(restrictions, undefined);
        expect(result).toEqual([
          { role: "authenticated-user", operations: ["READ"] },
        ]);
      });

      test("Scenario 2: Grant as an Array, No 'to'", () => {
        const restrictions: CdsRestriction[] = [
          {
            grant: ["READ", "UPDATE"],
          },
        ];

        const result = parseCdsRestrictions(restrictions, undefined);
        expect(result).toEqual([
          { role: "authenticated-user", operations: ["READ", "UPDATE"] },
        ]);
      });

      test("Scenario 3: Grant as a String, 'to' as an Array", () => {
        const restrictions: CdsRestriction[] = [
          {
            grant: "READ",
            to: ["viewer", "editor"],
          },
        ];

        const result = parseCdsRestrictions(restrictions, undefined);
        expect(result).toEqual([
          { role: "viewer", operations: ["READ"] },
          { role: "editor", operations: ["READ"] },
        ]);
      });

      test("Scenario 4: Grant as a String, 'to' as a String", () => {
        const restrictions: CdsRestriction[] = [
          {
            grant: "READ",
            to: "viewer",
          },
        ];

        const result = parseCdsRestrictions(restrictions, undefined);
        expect(result).toEqual([{ role: "viewer", operations: ["READ"] }]);
      });

      test("Scenario 5: Grant as an Array, 'to' as an Array", () => {
        const restrictions: CdsRestriction[] = [
          {
            grant: ["READ", "UPDATE"],
            to: ["maintainer", "admin"],
          },
        ];

        const result = parseCdsRestrictions(restrictions, undefined);
        expect(result).toEqual([
          { role: "maintainer", operations: ["READ", "UPDATE"] },
          { role: "admin", operations: ["READ", "UPDATE"] },
        ]);
      });

      test("Scenario 6: Grant as an Array, 'to' as a String", () => {
        const restrictions: CdsRestriction[] = [
          {
            grant: ["READ", "UPDATE"],
            to: "maintainer",
          },
        ];

        const result = parseCdsRestrictions(restrictions, undefined);
        expect(result).toEqual([
          { role: "maintainer", operations: ["READ", "UPDATE"] },
        ]);
      });

      test("should map WRITE to all CRUD operations (string grant)", () => {
        const restrictions: CdsRestriction[] = [
          {
            grant: "WRITE",
            to: "admin",
          },
        ];

        const result = parseCdsRestrictions(restrictions, undefined);
        expect(result).toEqual([
          {
            role: "admin",
            operations: ["CREATE", "READ", "UPDATE", "DELETE"],
          },
        ]);
      });

      test("should map WRITE to all CRUD operations (array grant)", () => {
        const restrictions: CdsRestriction[] = [
          {
            grant: ["WRITE"],
            to: ["admin", "superuser"],
          },
        ];

        const result = parseCdsRestrictions(restrictions, undefined);
        expect(result).toEqual([
          {
            role: "admin",
            operations: ["CREATE", "READ", "UPDATE", "DELETE"],
          },
          {
            role: "superuser",
            operations: ["CREATE", "READ", "UPDATE", "DELETE"],
          },
        ]);
      });

      test("should handle mixed WRITE and specific operations", () => {
        const restrictions: CdsRestriction[] = [
          {
            grant: ["READ", "WRITE"],
            to: "poweruser",
          },
        ];

        const result = parseCdsRestrictions(restrictions, undefined);
        expect(result).toEqual([
          {
            role: "poweruser",
            operations: ["READ", "CREATE", "READ", "UPDATE", "DELETE"],
          },
        ]);
      });

      test("should handle wildcard with string 'to'", () => {
        const restrictions: CdsRestriction[] = [
          {
            grant: "*",
            to: "admin",
          },
        ];

        const result = parseCdsRestrictions(restrictions, undefined);
        expect(result).toEqual([
          {
            role: "admin",
            operations: ["CREATE", "READ", "UPDATE", "DELETE"],
          },
        ]);
      });

      test("should handle CHANGE with string 'to'", () => {
        const restrictions: CdsRestriction[] = [
          {
            grant: "CHANGE",
            to: "editor",
          },
        ];

        const result = parseCdsRestrictions(restrictions, undefined);
        expect(result).toEqual([{ role: "editor", operations: ["UPDATE"] }]);
      });

      test("should handle multiple string grants with array 'to'", () => {
        const restrictions: CdsRestriction[] = [
          {
            grant: "READ",
            to: ["role1", "role2"],
          },
          {
            grant: "UPDATE",
            to: ["role3", "role4"],
          },
        ];

        const result = parseCdsRestrictions(restrictions, undefined);
        expect(result).toEqual([
          { role: "role1", operations: ["READ"] },
          { role: "role2", operations: ["READ"] },
          { role: "role3", operations: ["UPDATE"] },
          { role: "role4", operations: ["UPDATE"] },
        ]);
      });

      test("should handle complex mixed scenario", () => {
        const restrictions: CdsRestriction[] = [
          {
            grant: "READ",
            to: "viewer",
          },
          {
            grant: ["CREATE", "UPDATE"],
            to: ["editor", "maintainer"],
          },
          {
            grant: "DELETE",
          },
          {
            grant: "WRITE",
            to: "admin",
          },
        ];

        const result = parseCdsRestrictions(restrictions, undefined);
        expect(result).toEqual([
          { role: "viewer", operations: ["READ"] },
          { role: "editor", operations: ["CREATE", "UPDATE"] },
          { role: "maintainer", operations: ["CREATE", "UPDATE"] },
          { role: "authenticated-user", operations: ["DELETE"] },
          {
            role: "admin",
            operations: ["CREATE", "READ", "UPDATE", "DELETE"],
          },
        ]);
      });
    });
  });

  describe("containsRequiredElicitedParams", () => {
    test("should return true when elicit is undefined", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        name: "test",
        description: "test description",
      };

      expect(containsRequiredElicitedParams(annotations)).toBe(true);
    });

    test("should return true when elicit array has valid values", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        name: "test",
        description: "test description",
        elicit: ["input", "confirm"],
      };

      expect(containsRequiredElicitedParams(annotations)).toBe(true);
    });

    test("should return true when elicit array has single valid value", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        name: "test",
        description: "test description",
        elicit: ["input"],
      };

      expect(containsRequiredElicitedParams(annotations)).toBe(true);
    });

    test("should throw error when elicit array is empty", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        name: "test",
        description: "test description",
        elicit: [],
        target: "test.target",
        definition: {} as any,
      };

      expect(() => containsRequiredElicitedParams(annotations)).toThrow(
        "Invalid annotation 'test.target' - Incomplete elicited user input",
      );
    });

    test("should throw error with undefined target when definition is missing", () => {
      const annotations: Partial<McpAnnotationStructure> = {
        name: "test",
        description: "test description",
        elicit: [],
      };

      expect(() => containsRequiredElicitedParams(annotations)).toThrow(
        "Invalid annotation 'undefined' - Incomplete elicited user input",
      );
    });
  });
});
