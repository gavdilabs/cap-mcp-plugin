import { csn } from "@sap/cds";
import { parseDeepInsertRefs } from "../../../src/annotations/utils";

/**
 * Tests for @mcp.deepInsert annotation parsing
 *
 * This annotation allows associations to support deep insert operations,
 * similar to how compositions work by default.
 */
describe("Annotation Parsing - @mcp.deepInsert for Associations", () => {
  it("should parse @mcp.deepInsert annotation on association elements", () => {
    const definition: csn.Definition = {
      kind: "entity",
      elements: {
        ID: { type: "cds.UUID", key: true },
        totalAmount: { type: "cds.Integer" },
        items: {
          type: "cds.Association",
          target: "TestService.InvoiceItems",
          cardinality: { max: "*" },
          "@mcp.deepInsert": "TestService.InvoiceItems",
        },
      },
    } as any;

    const result = parseDeepInsertRefs(definition);

    expect(result.size).toBe(1);
    expect(result.has("items")).toBe(true);
    expect(result.get("items")).toBe("TestService.InvoiceItems");
  });

  it("should handle multiple @mcp.deepInsert annotations", () => {
    const definition: csn.Definition = {
      kind: "entity",
      elements: {
        ID: { type: "cds.UUID", key: true },
        invoiceItems: {
          type: "cds.Association",
          "@mcp.deepInsert": "TestService.InvoiceItems",
        },
        orderItems: {
          type: "cds.Association",
          "@mcp.deepInsert": "TestService.OrderItems",
        },
      },
    } as any;

    const result = parseDeepInsertRefs(definition);

    expect(result.size).toBe(2);
    expect(result.get("invoiceItems")).toBe("TestService.InvoiceItems");
    expect(result.get("orderItems")).toBe("TestService.OrderItems");
  });

  it("should ignore elements without @mcp.deepInsert annotation", () => {
    const definition: csn.Definition = {
      kind: "entity",
      elements: {
        ID: { type: "cds.UUID", key: true },
        totalAmount: { type: "cds.Integer" },
        regularAssociation: {
          type: "cds.Association",
          target: "TestService.Customers",
          // No @mcp.deepInsert annotation
        },
        deepInsertAssociation: {
          type: "cds.Association",
          "@mcp.deepInsert": "TestService.InvoiceItems",
        },
      },
    } as any;

    const result = parseDeepInsertRefs(definition);

    expect(result.size).toBe(1);
    expect(result.has("regularAssociation")).toBe(false);
    expect(result.has("deepInsertAssociation")).toBe(true);
  });

  it("should return empty map when no elements exist", () => {
    const definition: csn.Definition = {
      kind: "entity",
    } as any;

    const result = parseDeepInsertRefs(definition);

    expect(result.size).toBe(0);
  });

  it("should return empty map when definition is undefined", () => {
    const result = parseDeepInsertRefs(undefined as any);

    expect(result.size).toBe(0);
  });

  it("should handle @mcp.deepInsert with external OData service targets", () => {
    // Use case: Projecting from external SAP S/4HANA OData service
    const definition: csn.Definition = {
      kind: "entity",
      elements: {
        ID: { type: "cds.UUID", key: true },
        items: {
          type: "cds.Association",
          target: "ExternalInvoiceService.InvoiceItems",
          "@mcp.deepInsert": "ExternalInvoiceService.InvoiceItems",
        },
      },
    } as any;

    const result = parseDeepInsertRefs(definition);

    expect(result.size).toBe(1);
    expect(result.get("items")).toBe("ExternalInvoiceService.InvoiceItems");
  });

  it("should only parse string values for @mcp.deepInsert", () => {
    const definition: csn.Definition = {
      kind: "entity",
      elements: {
        validAnnotation: {
          type: "cds.Association",
          "@mcp.deepInsert": "TestService.InvoiceItems",
        },
        invalidAnnotation: {
          type: "cds.Association",
          "@mcp.deepInsert": true, // Invalid: not a string
        },
      },
    } as any;

    const result = parseDeepInsertRefs(definition);

    expect(result.size).toBe(1);
    expect(result.has("validAnnotation")).toBe(true);
    expect(result.has("invalidAnnotation")).toBe(false);
  });
});
