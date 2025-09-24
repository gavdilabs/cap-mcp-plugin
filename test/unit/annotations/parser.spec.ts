import { parseDefinitions } from "../../../src/annotations/parser";
import { csn } from "@sap/cds";
import {
  McpResourceAnnotation,
  McpToolAnnotation,
  McpPromptAnnotation,
} from "../../../src/annotations/structures";

// Mock logger
jest.mock("../../../src/logger", () => ({
  LOGGER: {
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("Parser", () => {
  describe("parseDefinitions", () => {
    test("should throw error for invalid model", () => {
      const invalidModel = {} as csn.CSN;

      expect(() => parseDefinitions(invalidModel)).toThrow(
        "Cannot parse model without valid definitions",
      );
    });

    test("should parse entity with resource annotation", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.TestEntity": {
            kind: "entity",
            "@mcp.name": "Test Entity",
            "@mcp.description": "Test entity description",
            "@mcp.resource": true,
            elements: {
              id: { type: "cds.UUID", key: true },
              name: { type: "cds.String" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestEntity");
      expect(annotation).toBeInstanceOf(McpResourceAnnotation);
      expect(annotation!.name).toBe("Test Entity");
      expect(annotation!.serviceName).toBe("TestService");
      expect((annotation as McpResourceAnnotation).restrictions).toEqual([]);
    });

    test("should parse entity with resource annotation and restrictions", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.TestEntity": {
            kind: "entity",
            "@mcp.name": "Test Entity",
            "@mcp.description": "Test entity description",
            "@mcp.resource": true,
            "@restrict": [
              {
                grant: ["READ"],
                to: ["read-role"],
              },
            ],
            elements: {
              id: { type: "cds.UUID", key: true },
              name: { type: "cds.String" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestEntity") as McpResourceAnnotation;
      expect(annotation).toBeInstanceOf(McpResourceAnnotation);
      expect(annotation.restrictions).toEqual([
        { role: "read-role", operations: ["READ"] },
      ]);
    });

    test("should parse function with tool annotation", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.TestFunction": {
            kind: "function",
            "@mcp.name": "Test Function",
            "@mcp.description": "Test function description",
            "@mcp.tool": true,
            params: {
              input: { type: "cds.String" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestFunction");
      expect(annotation).toBeInstanceOf(McpToolAnnotation);
      expect(annotation!.name).toBe("Test Function");
      expect((annotation as McpToolAnnotation).restrictions).toEqual([]);
    });

    test("should parse function with tool annotation and requires", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.TestFunction": {
            kind: "function",
            "@mcp.name": "Test Function",
            "@mcp.description": "Test function description",
            "@mcp.tool": true,
            "@requires": "author-specialist",
            params: {
              input: { type: "cds.String" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestFunction") as McpToolAnnotation;
      expect(annotation).toBeInstanceOf(McpToolAnnotation);
      expect(annotation.restrictions).toEqual([{ role: "author-specialist" }]);
    });

    test("should parse service with prompts annotation", () => {
      const model: csn.CSN = {
        definitions: {
          TestService: {
            kind: "service",
            "@mcp.name": "Test Service",
            "@mcp.description": "Test service description",
            "@mcp.prompts": [
              {
                name: "test-prompt",
                title: "Test Prompt",
                description: "Test prompt description",
                template: "Test {input}",
                role: "user",
                inputs: [{ key: "input", type: "String" }],
              },
            ],
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestService");
      expect(annotation).toBeInstanceOf(McpPromptAnnotation);
      expect(annotation!.name).toBe("Test Service");
    });

    test("should skip definitions without MCP annotations", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.RegularEntity": {
            kind: "entity",
            elements: {
              id: { type: "cds.UUID", key: true },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);
      expect(result.size).toBe(0);
    });

    test("should parse bound operations", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.TestEntity": {
            kind: "entity",
            elements: {
              id: { type: "cds.UUID", key: true },
            },
            actions: {
              boundAction: {
                kind: "action",
                "@mcp.name": "Bound Action",
                "@mcp.description": "Bound action description",
                "@mcp.tool": true,
              },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("boundAction");
      expect(annotation).toBeInstanceOf(McpToolAnnotation);
      expect(annotation!.name).toBe("Bound Action");
    });

    test("should parse bound operations with custom-typed parameter", () => {
      const model: csn.CSN = {
        definitions: {
          "myTypes.CustomDouble": {
            kind: "type",
            elements: {
              double1: { type: "cds.Double" },
            },
          },
          "TestService.TestEntity": {
            kind: "entity",
            elements: {
              id: { type: "cds.UUID", key: true },
            },
            actions: {
              boundAction: {
                kind: "action",
                "@mcp.name": "Bound Action",
                "@mcp.description": "Bound action description",
                "@mcp.tool": true,
                params: {
                  input: {
                    type: { ref: ["myTypes.CustomDouble", "double1"] },
                  },
                },
              },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("boundAction");
      expect(annotation).toBeInstanceOf(McpToolAnnotation);
      expect(annotation!.name).toBe("Bound Action");
      const toolAnnotation = annotation as McpToolAnnotation;
      expect(toolAnnotation.parameters?.get("input")).toBe("Double");
    });

    test("should parse function with complex-typed parameter", () => {
      const model: csn.CSN = {
        definitions: {
          "myTypes.ComplexType": {
            kind: "type",
            elements: {
              stringField: { type: "cds.String" },
              numberField: { type: "cds.Integer" },
            },
          },
          "TestService.TestFunction": {
            kind: "function",
            "@mcp.name": "Test Function",
            "@mcp.description": "Test function description",
            "@mcp.tool": true,
            params: {
              complexParam: {
                type: { ref: ["myTypes.ComplexType", "stringField"] },
              },
              simpleParam: { type: "cds.Boolean" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestFunction");
      expect(annotation).toBeInstanceOf(McpToolAnnotation);
      expect(annotation!.name).toBe("Test Function");
      const toolAnnotation = annotation as McpToolAnnotation;
      expect(toolAnnotation.parameters?.get("complexParam")).toBe("String");
      expect(toolAnnotation.parameters?.get("simpleParam")).toBe("Boolean");
    });

    test("should parse function with nested complex-typed parameter", () => {
      const model: csn.CSN = {
        definitions: {
          "myTypes.ComplexType": {
            kind: "type",
            elements: {
              stringField: {
                type: { ref: ["myTypes.NestedComplexType", "complex"] },
              },
              numberField: { type: "cds.Integer" },
            },
          },
          "myTypes.NestedComplexType": {
            kind: "type",
            elements: {
              complex: { type: "cds.String" },
            },
          },
          "TestService.TestFunction": {
            kind: "function",
            "@mcp.name": "Test Function",
            "@mcp.description": "Test function description",
            "@mcp.tool": true,
            params: {
              nestedComplexParam: {
                type: { ref: ["myTypes.ComplexType", "stringField"] },
              },
              simpleParam: { type: "cds.Boolean" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestFunction");
      expect(annotation).toBeInstanceOf(McpToolAnnotation);
      expect(annotation!.name).toBe("Test Function");
      const toolAnnotation = annotation as McpToolAnnotation;
      expect(toolAnnotation.parameters?.get("nestedComplexParam")).toBe(
        "String",
      );
      expect(toolAnnotation.parameters?.get("simpleParam")).toBe("Boolean");
    });

    test("should parse action with multiple complex-typed parameters", () => {
      const model: csn.CSN = {
        definitions: {
          "myTypes.Address": {
            kind: "type",
            elements: {
              street: { type: "cds.String" },
              city: { type: "cds.String" },
              zipCode: { type: "cds.Integer" },
            },
          },
          "myTypes.Person": {
            kind: "type",
            elements: {
              name: { type: "cds.String" },
              age: { type: "cds.Integer" },
              isActive: { type: "cds.Boolean" },
            },
          },
          "TestService.TestAction": {
            kind: "action",
            "@mcp.name": "Test Action",
            "@mcp.description": "Test action with multiple complex types",
            "@mcp.tool": true,
            params: {
              personName: {
                type: { ref: ["myTypes.Person", "name"] },
              },
              personAge: {
                type: { ref: ["myTypes.Person", "age"] },
              },
              addressZip: {
                type: { ref: ["myTypes.Address", "zipCode"] },
              },
              isPersonActive: {
                type: { ref: ["myTypes.Person", "isActive"] },
              },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestAction");
      expect(annotation).toBeInstanceOf(McpToolAnnotation);
      expect(annotation!.name).toBe("Test Action");
      const toolAnnotation = annotation as McpToolAnnotation;
      expect(toolAnnotation.parameters?.get("personName")).toBe("String");
      expect(toolAnnotation.parameters?.get("personAge")).toBe("Integer");
      expect(toolAnnotation.parameters?.get("addressZip")).toBe("Integer");
      expect(toolAnnotation.parameters?.get("isPersonActive")).toBe("Boolean");
    });

    test("should handle mixed valid and invalid definitions", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.ValidEntity": {
            kind: "entity",
            "@mcp.name": "Valid Entity",
            "@mcp.description": "Valid entity description",
            "@mcp.resource": true,
            elements: {
              id: { type: "cds.UUID", key: true },
            },
          },
          "TestService.InvalidEntity": {
            kind: "entity",
            "@mcp.name": "Invalid Entity",
            // Missing description
            "@mcp.resource": true,
            elements: {
              id: { type: "cds.UUID", key: true },
            },
          },
        },
      } as any;

      expect(() => parseDefinitions(model)).toThrow();
    });

    test("should handle empty definitions", () => {
      const model: csn.CSN = {
        definitions: {},
      };

      const result = parseDefinitions(model);
      expect(result.size).toBe(0);
    });

    test("should parse tool annotation with elicit input", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.testAction": {
            kind: "action",
            "@mcp.name": "Test Action",
            "@mcp.description": "Test action with elicit",
            "@mcp.tool": true,
            "@mcp.elicit": ["input"],
            params: {
              input: { type: "cds.String" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("testAction") as McpToolAnnotation;
      expect(annotation).toBeInstanceOf(McpToolAnnotation);
      expect(annotation.name).toBe("Test Action");
      expect(annotation.elicits).toEqual(["input"]);
    });

    test("should parse tool annotation with multiple elicit types", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.testAction": {
            kind: "action",
            "@mcp.name": "Test Action",
            "@mcp.description": "Test action with multiple elicits",
            "@mcp.tool": true,
            "@mcp.elicit": ["input", "confirm"],
            params: {
              input: { type: "cds.String" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("testAction") as McpToolAnnotation;
      expect(annotation).toBeInstanceOf(McpToolAnnotation);
      expect(annotation.elicits).toEqual(["input", "confirm"]);
    });

    test("should parse bound tool annotation with elicit", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.TestEntity": {
            kind: "entity",
            elements: {
              id: { type: "cds.UUID", key: true },
            },
            actions: {
              boundActionWithElicit: {
                kind: "action",
                "@mcp.name": "Bound Action with Elicit",
                "@mcp.description": "Bound action with elicit",
                "@mcp.tool": true,
                "@mcp.elicit": ["confirm"],
              },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get(
        "boundActionWithElicit",
      ) as McpToolAnnotation;
      expect(annotation).toBeInstanceOf(McpToolAnnotation);
      expect(annotation.name).toBe("Bound Action with Elicit");
      expect(annotation.elicits).toEqual(["confirm"]);
    });

    test("should handle tool annotation without elicit", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.testAction": {
            kind: "action",
            "@mcp.name": "Test Action",
            "@mcp.description": "Test action without elicit",
            "@mcp.tool": true,
            params: {
              input: { type: "cds.String" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("testAction") as McpToolAnnotation;
      expect(annotation).toBeInstanceOf(McpToolAnnotation);
      expect(annotation.elicits).toBeUndefined();
    });

    test("should throw error for empty elicit array", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.testAction": {
            kind: "action",
            "@mcp.name": "Test Action",
            "@mcp.description": "Test action with empty elicit",
            "@mcp.tool": true,
            "@mcp.elicit": [],
            params: {
              input: { type: "cds.String" },
            },
          },
        },
      } as any;

      expect(() => parseDefinitions(model)).toThrow(
        "Invalid annotation 'TestService.testAction' - Incomplete elicited user input",
      );
    });

    test("should parse entity with flattened @mcp.wrap annotations", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.TestEntity": {
            kind: "entity",
            "@mcp.name": "Test Entity",
            "@mcp.description": "Test entity with wrap annotations",
            "@mcp.resource": true,
            "@mcp.wrap.tools": true,
            "@mcp.wrap.modes": ["query", "get", "create", "update"],
            "@mcp.wrap.hint": "Use for demo operations",
            elements: {
              id: { type: "cds.UUID", key: true },
              name: { type: "cds.String" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestEntity") as McpResourceAnnotation;
      expect(annotation).toBeInstanceOf(McpResourceAnnotation);
      expect(annotation.name).toBe("Test Entity");

      // Verify wrap properties are correctly parsed from flattened annotations
      expect(annotation.wrap).toBeDefined();
      expect(annotation.wrap?.tools).toBe(true);
      expect(annotation.wrap?.modes).toEqual([
        "query",
        "get",
        "create",
        "update",
      ]);
      expect(annotation.wrap?.hint).toBe("Use for demo operations");
    });

    test("should parse entity with partial @mcp.wrap annotations", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.TestEntity": {
            kind: "entity",
            "@mcp.name": "Test Entity",
            "@mcp.description": "Test entity with partial wrap annotations",
            "@mcp.resource": true,
            "@mcp.wrap.modes": ["create", "delete"],
            elements: {
              id: { type: "cds.UUID", key: true },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestEntity") as McpResourceAnnotation;
      expect(annotation).toBeInstanceOf(McpResourceAnnotation);

      // Verify only modes are set, other wrap properties should be undefined
      expect(annotation.wrap).toBeDefined();
      expect(annotation.wrap?.tools).toBeUndefined();
      expect(annotation.wrap?.modes).toEqual(["create", "delete"]);
      expect(annotation.wrap?.hint).toBeUndefined();
    });

    test("should parse entity with flattened detailed hint annotations", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.TestEntity": {
            kind: "entity",
            "@mcp.name": "Test Entity",
            "@mcp.description": "Test entity with flattened detailed hints",
            "@mcp.resource": true,
            "@mcp.wrap.tools": true,
            "@mcp.wrap.modes": ["query", "get", "create", "update"],
            "@mcp.wrap.hint.query":
              "Query hint for retrieving multiple records",
            "@mcp.wrap.hint.get": "Get hint for retrieving single record",
            "@mcp.wrap.hint.create": "Create hint for adding new records",
            "@mcp.wrap.hint.update": "Update hint for modifying records",
            elements: {
              id: { type: "cds.UUID", key: true },
              name: { type: "cds.String" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestEntity") as McpResourceAnnotation;
      expect(annotation).toBeInstanceOf(McpResourceAnnotation);
      expect(annotation.name).toBe("Test Entity");

      // Verify detailed hints are correctly parsed from flattened annotations
      expect(annotation.wrap).toBeDefined();
      expect(annotation.wrap?.tools).toBe(true);
      expect(annotation.wrap?.modes).toEqual([
        "query",
        "get",
        "create",
        "update",
      ]);
      expect(annotation.wrap?.hint).toEqual({
        query: "Query hint for retrieving multiple records",
        get: "Get hint for retrieving single record",
        create: "Create hint for adding new records",
        update: "Update hint for modifying records",
      });
    });

    test("should parse entity with partial flattened detailed hint annotations", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.TestEntity": {
            kind: "entity",
            "@mcp.name": "Test Entity",
            "@mcp.description": "Test entity with partial detailed hints",
            "@mcp.resource": true,
            "@mcp.wrap.tools": true,
            "@mcp.wrap.modes": ["query", "get", "delete"],
            "@mcp.wrap.hint.query": "Custom query hint",
            "@mcp.wrap.hint.delete": "Custom delete hint",
            elements: {
              id: { type: "cds.UUID", key: true },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestEntity") as McpResourceAnnotation;
      expect(annotation).toBeInstanceOf(McpResourceAnnotation);

      // Verify only specified detailed hints are set
      expect(annotation.wrap).toBeDefined();
      expect(annotation.wrap?.hint).toEqual({
        query: "Custom query hint",
        delete: "Custom delete hint",
      });
    });

    test("should parse entity with nested detailed hint object structure", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.TestEntity": {
            kind: "entity",
            "@mcp.name": "Test Entity",
            "@mcp.description": "Test entity with nested hint object",
            "@mcp.resource": true,
            "@mcp.wrap": {
              tools: true,
              modes: ["query", "get", "create", "update"],
              hint: {
                query: "Retrieves lists of data based on query parameters",
                get: "Retrieves a singular entity",
                create: "Creates a new record",
                update: "Updates properties of existing record",
              },
            },
            elements: {
              id: { type: "cds.UUID", key: true },
              name: { type: "cds.String" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestEntity") as McpResourceAnnotation;
      expect(annotation).toBeInstanceOf(McpResourceAnnotation);
      expect(annotation.name).toBe("Test Entity");

      // Verify nested detailed hint object is correctly parsed
      expect(annotation.wrap).toBeDefined();
      expect(annotation.wrap?.tools).toBe(true);
      expect(annotation.wrap?.modes).toEqual([
        "query",
        "get",
        "create",
        "update",
      ]);
      expect(annotation.wrap?.hint).toEqual({
        query: "Retrieves lists of data based on query parameters",
        get: "Retrieves a singular entity",
        create: "Creates a new record",
        update: "Updates properties of existing record",
      });
    });

    test("should parse entity with mixed hint types (string and detailed object)", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.EntityWithStringHint": {
            kind: "entity",
            "@mcp.name": "Entity With String Hint",
            "@mcp.description": "Test entity with simple string hint",
            "@mcp.resource": true,
            "@mcp.wrap.tools": true,
            "@mcp.wrap.modes": ["query", "get"],
            "@mcp.wrap.hint": "Simple string hint for all operations",
            elements: {
              id: { type: "cds.UUID", key: true },
            },
          },
          "TestService.EntityWithDetailedHint": {
            kind: "entity",
            "@mcp.name": "Entity With Detailed Hint",
            "@mcp.description": "Test entity with detailed hint object",
            "@mcp.resource": true,
            "@mcp.wrap.tools": true,
            "@mcp.wrap.modes": ["create", "update"],
            "@mcp.wrap.hint.create": "Detailed create hint",
            "@mcp.wrap.hint.update": "Detailed update hint",
            elements: {
              id: { type: "cds.UUID", key: true },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(2);

      // Check entity with string hint
      const stringHintAnnotation = result.get(
        "EntityWithStringHint",
      ) as McpResourceAnnotation;
      expect(stringHintAnnotation).toBeInstanceOf(McpResourceAnnotation);
      expect(stringHintAnnotation.wrap?.hint).toBe(
        "Simple string hint for all operations",
      );

      // Check entity with detailed hint object
      const detailedHintAnnotation = result.get(
        "EntityWithDetailedHint",
      ) as McpResourceAnnotation;
      expect(detailedHintAnnotation).toBeInstanceOf(McpResourceAnnotation);
      expect(detailedHintAnnotation.wrap?.hint).toEqual({
        create: "Detailed create hint",
        update: "Detailed update hint",
      });
    });

    test("should parse entity with all detailed hint operations", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.TestEntity": {
            kind: "entity",
            "@mcp.name": "Test Entity",
            "@mcp.description": "Test entity with all detailed hint operations",
            "@mcp.resource": true,
            "@mcp.wrap.tools": true,
            "@mcp.wrap.modes": ["query", "get", "create", "update", "delete"],
            "@mcp.wrap.hint.query": "Query operation hint",
            "@mcp.wrap.hint.get": "Get operation hint",
            "@mcp.wrap.hint.create": "Create operation hint",
            "@mcp.wrap.hint.update": "Update operation hint",
            "@mcp.wrap.hint.delete": "Delete operation hint",
            elements: {
              id: { type: "cds.UUID", key: true },
              name: { type: "cds.String" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestEntity") as McpResourceAnnotation;
      expect(annotation).toBeInstanceOf(McpResourceAnnotation);

      // Verify all detailed hint operations are correctly parsed
      expect(annotation.wrap?.hint).toEqual({
        query: "Query operation hint",
        get: "Get operation hint",
        create: "Create operation hint",
        update: "Update operation hint",
        delete: "Delete operation hint",
      });
    });

    test("should handle backward compatibility with simple string hints", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.TestEntity": {
            kind: "entity",
            "@mcp.name": "Test Entity",
            "@mcp.description":
              "Test entity with backward compatible string hint",
            "@mcp.resource": true,
            "@mcp.wrap": {
              tools: true,
              modes: ["query", "get"],
              hint: "Backward compatible string hint",
            },
            elements: {
              id: { type: "cds.UUID", key: true },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestEntity") as McpResourceAnnotation;
      expect(annotation).toBeInstanceOf(McpResourceAnnotation);

      // Verify string hint is preserved for backward compatibility
      expect(annotation.wrap?.hint).toBe("Backward compatible string hint");
    });

    test("should handle entity with no hint annotations", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.TestEntity": {
            kind: "entity",
            "@mcp.name": "Test Entity",
            "@mcp.description": "Test entity without any hints",
            "@mcp.resource": true,
            "@mcp.wrap.tools": true,
            "@mcp.wrap.modes": ["query", "get"],
            elements: {
              id: { type: "cds.UUID", key: true },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestEntity") as McpResourceAnnotation;
      expect(annotation).toBeInstanceOf(McpResourceAnnotation);

      // Verify hint is undefined when no hint annotations are present
      expect(annotation.wrap?.hint).toBeUndefined();
    });

    test("should combine flattened and nested wrap annotations correctly", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.TestEntity": {
            kind: "entity",
            "@mcp.name": "Test Entity",
            "@mcp.description": "Test entity with combined wrap annotations",
            "@mcp.resource": true,
            "@mcp.wrap.tools": true,
            "@mcp.wrap": {
              modes: ["query", "get", "create"],
            },
            "@mcp.wrap.hint.query": "Flattened query hint",
            "@mcp.wrap.hint.create": "Flattened create hint",
            elements: {
              id: { type: "cds.UUID", key: true },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestEntity") as McpResourceAnnotation;
      expect(annotation).toBeInstanceOf(McpResourceAnnotation);

      // Verify flattened and nested annotations are correctly combined
      expect(annotation.wrap?.tools).toBe(true);
      expect(annotation.wrap?.modes).toEqual(["query", "get", "create"]);
      expect(annotation.wrap?.hint).toEqual({
        query: "Flattened query hint",
        create: "Flattened create hint",
      });
    });

    test("should parse function with array parameter types", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.TestFunction": {
            kind: "function",
            "@mcp.name": "Test Array Function",
            "@mcp.description": "Test function with array parameters",
            "@mcp.tool": true,
            params: {
              stringIds: {
                items: { type: "cds.String" },
              },
              integerValues: {
                items: { type: "cds.Integer" },
              },
              booleanFlags: {
                items: { type: "cds.Boolean" },
              },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestFunction") as McpToolAnnotation;
      expect(annotation).toBeInstanceOf(McpToolAnnotation);
      expect(annotation.name).toBe("Test Array Function");
      expect(annotation.parameters?.get("stringIds")).toBe("StringArray");
      expect(annotation.parameters?.get("integerValues")).toBe("IntegerArray");
      expect(annotation.parameters?.get("booleanFlags")).toBe("BooleanArray");
    });

    test("should parse action with mixed array and non-array parameters", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.TestAction": {
            kind: "action",
            "@mcp.name": "Mixed Parameters Action",
            "@mcp.description": "Action with mixed parameter types",
            "@mcp.tool": true,
            params: {
              singleValue: { type: "cds.String" },
              arrayValues: {
                items: { type: "cds.String" },
              },
              numericValue: { type: "cds.Integer" },
              numericArray: {
                items: { type: "cds.Integer" },
              },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestAction") as McpToolAnnotation;
      expect(annotation).toBeInstanceOf(McpToolAnnotation);
      expect(annotation.parameters?.get("singleValue")).toBe("String");
      expect(annotation.parameters?.get("arrayValues")).toBe("StringArray");
      expect(annotation.parameters?.get("numericValue")).toBe("Integer");
      expect(annotation.parameters?.get("numericArray")).toBe("IntegerArray");
    });

    test("should parse function with array of complex types", () => {
      const model: csn.CSN = {
        definitions: {
          "myTypes.Person": {
            kind: "type",
            elements: {
              name: { type: "cds.String" },
              age: { type: "cds.Integer" },
            },
          },
          "TestService.TestFunction": {
            kind: "function",
            "@mcp.name": "Complex Array Function",
            "@mcp.description": "Function with array of complex types",
            "@mcp.tool": true,
            params: {
              personNames: {
                items: {
                  type: { ref: ["myTypes.Person", "name"] },
                },
              },
              personAges: {
                items: {
                  type: { ref: ["myTypes.Person", "age"] },
                },
              },
              simpleArray: {
                items: { type: "cds.UUID" },
              },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestFunction") as McpToolAnnotation;
      expect(annotation).toBeInstanceOf(McpToolAnnotation);
      expect(annotation.parameters?.get("personNames")).toBe("StringArray");
      expect(annotation.parameters?.get("personAges")).toBe("IntegerArray");
      expect(annotation.parameters?.get("simpleArray")).toBe("UUIDArray");
    });

    test("should parse bound operation with array parameters", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.TestEntity": {
            kind: "entity",
            elements: {
              id: { type: "cds.UUID", key: true },
            },
            actions: {
              processItems: {
                kind: "action",
                "@mcp.name": "Process Items",
                "@mcp.description": "Bound action with array parameters",
                "@mcp.tool": true,
                params: {
                  itemIds: {
                    items: { type: "cds.UUID" },
                  },
                  quantities: {
                    items: { type: "cds.Integer" },
                  },
                  enabled: { type: "cds.Boolean" },
                },
              },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("processItems") as McpToolAnnotation;
      expect(annotation).toBeInstanceOf(McpToolAnnotation);
      expect(annotation.name).toBe("Process Items");
      expect(annotation.parameters?.get("itemIds")).toBe("UUIDArray");
      expect(annotation.parameters?.get("quantities")).toBe("IntegerArray");
      expect(annotation.parameters?.get("enabled")).toBe("Boolean");
    });

    test("should handle all supported array types correctly", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.AllArrayTypesFunction": {
            kind: "function",
            "@mcp.name": "All Array Types",
            "@mcp.description": "Function testing all array types",
            "@mcp.tool": true,
            params: {
              uuids: { items: { type: "cds.UUID" } },
              strings: { items: { type: "cds.String" } },
              integers: { items: { type: "cds.Integer" } },
              int16s: { items: { type: "cds.Int16" } },
              int32s: { items: { type: "cds.Int32" } },
              int64s: { items: { type: "cds.Int64" } },
              uint8s: { items: { type: "cds.UInt8" } },
              decimals: { items: { type: "cds.Decimal" } },
              doubles: { items: { type: "cds.Double" } },
              booleans: { items: { type: "cds.Boolean" } },
              dates: { items: { type: "cds.Date" } },
              times: { items: { type: "cds.Time" } },
              datetimes: { items: { type: "cds.DateTime" } },
              timestamps: { items: { type: "cds.Timestamp" } },
              binaries: { items: { type: "cds.Binary" } },
              largeBinaries: { items: { type: "cds.LargeBinary" } },
              largeStrings: { items: { type: "cds.LargeString" } },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get(
        "AllArrayTypesFunction",
      ) as McpToolAnnotation;
      expect(annotation).toBeInstanceOf(McpToolAnnotation);

      // Verify all array types are properly mapped with "Array" suffix
      expect(annotation.parameters?.get("uuids")).toBe("UUIDArray");
      expect(annotation.parameters?.get("strings")).toBe("StringArray");
      expect(annotation.parameters?.get("integers")).toBe("IntegerArray");
      expect(annotation.parameters?.get("int16s")).toBe("Int16Array");
      expect(annotation.parameters?.get("int32s")).toBe("Int32Array");
      expect(annotation.parameters?.get("int64s")).toBe("Int64Array");
      expect(annotation.parameters?.get("uint8s")).toBe("UInt8Array");
      expect(annotation.parameters?.get("decimals")).toBe("DecimalArray");
      expect(annotation.parameters?.get("doubles")).toBe("DoubleArray");
      expect(annotation.parameters?.get("booleans")).toBe("BooleanArray");
      expect(annotation.parameters?.get("dates")).toBe("DateArray");
      expect(annotation.parameters?.get("times")).toBe("TimeArray");
      expect(annotation.parameters?.get("datetimes")).toBe("DateTimeArray");
      expect(annotation.parameters?.get("timestamps")).toBe("TimestampArray");
      expect(annotation.parameters?.get("binaries")).toBe("BinaryArray");
      expect(annotation.parameters?.get("largeBinaries")).toBe(
        "LargeBinaryArray",
      );
      expect(annotation.parameters?.get("largeStrings")).toBe(
        "LargeStringArray",
      );
    });

    test("should handle empty detailed hint object", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.TestEntity": {
            kind: "entity",
            "@mcp.name": "Test Entity",
            "@mcp.description": "Test entity with empty hint object",
            "@mcp.resource": true,
            "@mcp.wrap": {
              tools: true,
              modes: ["query"],
              hint: {},
            },
            elements: {
              id: { type: "cds.UUID", key: true },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("TestEntity") as McpResourceAnnotation;
      expect(annotation).toBeInstanceOf(McpResourceAnnotation);

      // Verify empty hint object is handled correctly
      expect(annotation.wrap?.hint).toEqual({});
    });
  });
});
