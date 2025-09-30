import { parseDefinitions } from "../../../src/annotations/parser";
import { csn } from "@sap/cds";
import {
  McpResourceAnnotation,
  McpToolAnnotation,
} from "../../../src/annotations/structures";

// Mock logger
jest.mock("../../../src/logger", () => ({
  LOGGER: {
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("Complex Keys Annotation Parser", () => {
  describe("parseDefinitions with complex key structures", () => {
    test("should parse entity with multiple primitive keys", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.MultiKeyEntity": {
            kind: "entity",
            "@mcp.name": "Multi Key Entity",
            "@mcp.description": "Entity with multiple primitive keys",
            "@mcp.resource": true,
            elements: {
              ID: { type: "cds.UUID", key: true },
              random: { type: "cds.Integer", key: true },
              description: { type: "cds.String" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("MultiKeyEntity");
      expect(annotation).toBeInstanceOf(McpResourceAnnotation);
      expect(annotation!.name).toBe("Multi Key Entity");
      expect(annotation!.serviceName).toBe("TestService");
    });

    test("should parse entity with association key", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.Other": {
            kind: "entity",
            elements: {
              ID: { type: "cds.UUID", key: true },
              description: { type: "cds.String" },
            },
          },
          "TestService.EntityWithAssociationKey": {
            kind: "entity",
            "@mcp.name": "Entity With Association Key",
            "@mcp.description": "Entity with association as key",
            "@mcp.resource": true,
            elements: {
              ID: { type: "cds.UUID", key: true },
              other: {
                type: "cds.Association",
                target: "TestService.Other",
                key: true,
                keys: [{ ref: ["ID"] }],
              },
              description: { type: "cds.String" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("EntityWithAssociationKey");
      expect(annotation).toBeInstanceOf(McpResourceAnnotation);
      expect(annotation!.name).toBe("Entity With Association Key");
    });

    test("should parse entity with mixed key types (primitives and associations)", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.Other": {
            kind: "entity",
            elements: {
              ID: { type: "cds.UUID", key: true },
              description: { type: "cds.String" },
            },
          },
          "TestService.ComplexKeyEntity": {
            kind: "entity",
            "@mcp.name": "Complex Key Entity",
            "@mcp.description": "Entity with mixed key types",
            "@mcp.resource": true,
            "@mcp.wrap": {
              tools: true,
              modes: ["query", "get", "create", "update", "delete"],
            },
            elements: {
              ID: { type: "cds.UUID", key: true },
              random: { type: "cds.Integer", key: true },
              other: {
                type: "cds.Association",
                target: "TestService.Other",
                key: true,
                keys: [{ ref: ["ID"] }],
              },
              date: { type: "cds.Date" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get(
        "ComplexKeyEntity",
      ) as McpResourceAnnotation;
      expect(annotation).toBeInstanceOf(McpResourceAnnotation);
      expect(annotation.name).toBe("Complex Key Entity");
      expect(annotation.wrap?.tools).toBe(true);
      expect(annotation.wrap?.modes).toEqual([
        "query",
        "get",
        "create",
        "update",
        "delete",
      ]);
    });

    test("should parse entity with composition relationship", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.Invoices": {
            kind: "entity",
            "@mcp.name": "Invoices",
            "@mcp.description": "Invoice entity with composition",
            "@mcp.resource": true,
            elements: {
              ID: { type: "cds.UUID", key: true },
              random: { type: "cds.Integer", key: true },
              date: { type: "cds.Date" },
              lineItems: {
                type: "cds.Composition",
                cardinality: { max: "*" },
                target: "TestService.InvoiceLines",
                on: [
                  { ref: ["lineItems", "toInvoice"] },
                  "=",
                  { ref: ["$self"] },
                ],
              },
            },
          },
          "TestService.InvoiceLines": {
            kind: "entity",
            "@mcp.name": "Invoice Lines",
            "@mcp.description": "Invoice line items",
            "@mcp.resource": true,
            elements: {
              ID: { type: "cds.UUID", key: true },
              toInvoice: {
                type: "cds.Association",
                target: "TestService.Invoices",
              },
              product: { type: "cds.String" },
              quantity: { type: "cds.Integer" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(2);

      const invoicesAnnotation = result.get("Invoices");
      expect(invoicesAnnotation).toBeInstanceOf(McpResourceAnnotation);
      expect(invoicesAnnotation!.name).toBe("Invoices");

      const linesAnnotation = result.get("InvoiceLines");
      expect(linesAnnotation).toBeInstanceOf(McpResourceAnnotation);
      expect(linesAnnotation!.name).toBe("Invoice Lines");
    });

    test("should parse bound operation on entity with complex keys", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.Other": {
            kind: "entity",
            elements: {
              ID: { type: "cds.UUID", key: true },
              description: { type: "cds.String" },
            },
          },
          "TestService.ComplexKeyEntity": {
            kind: "entity",
            elements: {
              ID: { type: "cds.UUID", key: true },
              random: { type: "cds.Integer", key: true },
              other: {
                type: "cds.Association",
                target: "TestService.Other",
                key: true,
                keys: [{ ref: ["ID"] }],
              },
              description: { type: "cds.String" },
            },
            actions: {
              processComplexEntity: {
                kind: "action",
                "@mcp.name": "Process Complex Entity",
                "@mcp.description": "Process entity with complex keys",
                "@mcp.tool": true,
                params: {
                  amount: { type: "cds.Decimal" },
                },
              },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("processComplexEntity");
      expect(annotation).toBeInstanceOf(McpToolAnnotation);
      expect(annotation!.name).toBe("Process Complex Entity");

      const toolAnnotation = annotation as McpToolAnnotation;
      expect(toolAnnotation.parameters?.get("amount")).toBe("Decimal");
    });

    test("should handle entity with association to entity with multiple keys", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.MultiKeyTarget": {
            kind: "entity",
            elements: {
              ID: { type: "cds.UUID", key: true },
              code: { type: "cds.String", key: true },
              description: { type: "cds.String" },
            },
          },
          "TestService.EntityWithComplexAssociation": {
            kind: "entity",
            "@mcp.name": "Entity With Complex Association",
            "@mcp.description": "Entity with association to multi-key target",
            "@mcp.resource": true,
            elements: {
              ID: { type: "cds.UUID", key: true },
              target: {
                type: "cds.Association",
                target: "TestService.MultiKeyTarget",
                keys: [{ ref: ["ID"] }, { ref: ["code"] }],
              },
              value: { type: "cds.String" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("EntityWithComplexAssociation");
      expect(annotation).toBeInstanceOf(McpResourceAnnotation);
      expect(annotation!.name).toBe("Entity With Complex Association");
    });

    test("should parse function with complex entity key parameters", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.Other": {
            kind: "entity",
            elements: {
              ID: { type: "cds.UUID", key: true },
              description: { type: "cds.String" },
            },
          },
          "TestService.ComplexKeyFunction": {
            kind: "function",
            "@mcp.name": "Complex Key Function",
            "@mcp.description": "Function working with complex key entities",
            "@mcp.tool": true,
            params: {
              entityId: { type: "cds.UUID" },
              randomKey: { type: "cds.Integer" },
              otherRef: { type: "cds.UUID" }, // Reference to Other.ID
              processMode: { type: "cds.String" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("ComplexKeyFunction");
      expect(annotation).toBeInstanceOf(McpToolAnnotation);
      expect(annotation!.name).toBe("Complex Key Function");

      const toolAnnotation = annotation as McpToolAnnotation;
      expect(toolAnnotation.parameters?.get("entityId")).toBe("UUID");
      expect(toolAnnotation.parameters?.get("randomKey")).toBe("Integer");
      expect(toolAnnotation.parameters?.get("otherRef")).toBe("UUID");
      expect(toolAnnotation.parameters?.get("processMode")).toBe("String");
    });

    test("should handle deeply nested key structures", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.Level1": {
            kind: "entity",
            elements: {
              ID: { type: "cds.UUID", key: true },
              name: { type: "cds.String" },
            },
          },
          "TestService.Level2": {
            kind: "entity",
            elements: {
              ID: { type: "cds.UUID", key: true },
              level1: {
                type: "cds.Association",
                target: "TestService.Level1",
                key: true,
                keys: [{ ref: ["ID"] }],
              },
              description: { type: "cds.String" },
            },
          },
          "TestService.Level3": {
            kind: "entity",
            "@mcp.name": "Level 3 Entity",
            "@mcp.description": "Entity with nested association keys",
            "@mcp.resource": true,
            elements: {
              ID: { type: "cds.UUID", key: true },
              level2: {
                type: "cds.Association",
                target: "TestService.Level2",
                key: true,
                keys: [{ ref: ["ID"] }, { ref: ["level1", "ID"] }],
              },
              value: { type: "cds.Integer" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(1);
      const annotation = result.get("Level3");
      expect(annotation).toBeInstanceOf(McpResourceAnnotation);
      expect(annotation!.name).toBe("Level 3 Entity");
    });

    test("should handle mixed valid and invalid complex key definitions", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.ValidComplexKey": {
            kind: "entity",
            "@mcp.name": "Valid Complex Key",
            "@mcp.description": "Valid entity with complex keys",
            "@mcp.resource": true,
            elements: {
              ID: { type: "cds.UUID", key: true },
              code: { type: "cds.String", key: true },
              description: { type: "cds.String" },
            },
          },
          "TestService.InvalidComplexKey": {
            kind: "entity",
            "@mcp.name": "Invalid Complex Key",
            // Missing description - should cause validation error
            "@mcp.resource": true,
            elements: {
              ID: { type: "cds.UUID", key: true },
              code: { type: "cds.String", key: true },
            },
          },
        },
      } as any;

      expect(() => parseDefinitions(model)).toThrow();
    });

    test("should parse entity with wrap tools and complex keys", () => {
      const model: csn.CSN = {
        definitions: {
          "TestService.Other": {
            kind: "entity",
            elements: {
              ID: { type: "cds.UUID", key: true },
              description: { type: "cds.String" },
            },
          },
          "AnMCPTestService1.Invoices": {
            kind: "entity",
            "@mcp.name": "test case 1",
            "@mcp.description": "test case",
            "@mcp.resource": true,
            "@mcp.wrap": {
              tools: true,
              modes: ["query", "get", "create", "update"],
            },
            elements: {
              ID: { type: "cds.UUID", key: true },
              random: { type: "cds.Integer", key: true },
              other: {
                type: "cds.Association",
                target: "TestService.Other",
                key: true,
                keys: [{ ref: ["ID"] }],
              },
              date: { type: "cds.Date" },
              lineItems: {
                type: "cds.Composition",
                cardinality: { max: "*" },
                target: "AnMCPTestService1.InvoiceLines",
                on: [
                  { ref: ["lineItems", "toInvoice"] },
                  "=",
                  { ref: ["$self"] },
                ],
              },
            },
          },
          "AnMCPTestService1.InvoiceLines": {
            kind: "entity",
            "@mcp.name": "test case 2",
            "@mcp.description": "test case",
            "@mcp.resource": true,
            "@mcp.wrap": {
              tools: true,
              modes: ["query", "get", "create", "update"],
            },
            elements: {
              ID: { type: "cds.UUID", key: true },
              toInvoice: {
                type: "cds.Association",
                target: "AnMCPTestService1.Invoices",
              },
              product: { type: "cds.String" },
              quantity: { type: "cds.Integer" },
            },
          },
        },
      } as any;

      const result = parseDefinitions(model);

      expect(result.size).toBe(2);

      const invoicesAnnotation = result.get(
        "Invoices",
      ) as McpResourceAnnotation;
      expect(invoicesAnnotation).toBeInstanceOf(McpResourceAnnotation);
      expect(invoicesAnnotation.name).toBe("test case 1");
      expect(invoicesAnnotation.wrap?.tools).toBe(true);
      expect(invoicesAnnotation.wrap?.modes).toEqual([
        "query",
        "get",
        "create",
        "update",
      ]);

      const linesAnnotation = result.get(
        "InvoiceLines",
      ) as McpResourceAnnotation;
      expect(linesAnnotation).toBeInstanceOf(McpResourceAnnotation);
      expect(linesAnnotation.name).toBe("test case 2");
      expect(linesAnnotation.wrap?.tools).toBe(true);
      expect(linesAnnotation.wrap?.modes).toEqual([
        "query",
        "get",
        "create",
        "update",
      ]);
    });
  });
});
