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
                    "@mcp.cdsType": "cds.Double",
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
  });
});
