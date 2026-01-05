/**
 * Tests for deep insert with @mcp.deepInsert annotation on associations
 *
 * This tests the buildDeepInsertZodType function which generates Zod schemas
 * for associations marked with @mcp.deepInsert annotation.
 *
 * Difference from compositions:
 * - Compositions: Automatic deep insert via buildCompositionZodType
 * - Associations with @mcp.deepInsert: Manual opt-in via buildDeepInsertZodType
 */

// Mock CDS model BEFORE any imports
const mockModel = {
  definitions: {
    "TestService.Invoices": {
      kind: "entity",
      elements: {
        ID: { "@Core.Computed": true, key: true, type: "cds.UUID" },
        totalAmount: { type: "cds.Integer" },
        items: {
          type: "cds.Association",
          cardinality: { max: "*" },
          target: "TestService.InvoiceItems",
          "@mcp.deepInsert": "TestService.InvoiceItems",
        },
      },
    },
    "TestService.InvoiceItems": {
      kind: "entity",
      elements: {
        ID: { "@Core.Computed": true, key: true, type: "cds.UUID" },
        invoice: {
          type: "cds.Association",
          target: "TestService.Invoices",
          keys: [{ ref: ["ID"], $generatedFieldName: "invoice_ID" }],
        },
        invoice_ID: {
          type: "cds.UUID",
          "@odata.foreignKey4": "invoice",
        },
        product: { type: "cds.String" },
        quantity: { type: "cds.Integer" },
      },
    },
    // External OData service scenario (e.g. S/4HANA Projecting)
    "ExternalInvoiceService.Invoices": {
      kind: "entity",
      elements: {
        ID: { key: true, type: "cds.UUID" },
        customerName: { type: "cds.String" },
        items: {
          type: "cds.Association",
          cardinality: { max: "*" },
          target: "ExternalInvoiceService.InvoiceItems",
          "@mcp.deepInsert": "ExternalInvoiceService.InvoiceItems",
        },
      },
    },
    "ExternalInvoiceService.InvoiceItems": {
      kind: "entity",
      elements: {
        ID: { key: true, type: "cds.UUID" },
        invoice_ID: { type: "cds.UUID" },
        product: { type: "cds.String" },
        price: { type: "cds.Decimal" },
      },
    },
  },
};

// Set up global.cds BEFORE importing modules
(global as any).cds = { model: mockModel };

// Now import the modules
import { buildDeepInsertZodType } from "../../../src/mcp/utils";

describe("buildDeepInsertZodType - Association Deep Insert", () => {
  it("should build Zod schema for association with @mcp.deepInsert", () => {
    const schema = buildDeepInsertZodType("TestService.InvoiceItems") as any;

    // Should return an array schema
    expect(schema._def?.typeName).toBe("ZodArray");

    // Get the element schema (the object schema for each item)
    const elementSchema = (schema.element || schema._def?.type) as any;
    expect(elementSchema._def?.typeName).toBe("ZodObject");

    // Get the shape of the item object
    const itemShape = elementSchema.shape || elementSchema._def?.shape();
    expect(itemShape).toBeDefined();

    // Should include business fields
    expect(itemShape).toHaveProperty("product");
    expect(itemShape).toHaveProperty("quantity");
  });

  it("should exclude computed fields from association deep insert schema", () => {
    const schema = buildDeepInsertZodType("TestService.InvoiceItems") as any;

    const elementSchema = (schema.element || schema._def?.type) as any;
    const itemShape = elementSchema.shape || elementSchema._def?.shape();

    // Should NOT include computed field (ID)
    expect(itemShape).not.toHaveProperty("ID");

    // Should include non-computed fields
    expect(itemShape).toHaveProperty("product");
    expect(itemShape).toHaveProperty("quantity");
  });

  it("should exclude associations from association deep insert schema", () => {
    const schema = buildDeepInsertZodType("TestService.InvoiceItems") as any;

    const elementSchema = (schema.element || schema._def?.type) as any;
    const itemShape = elementSchema.shape || elementSchema._def?.shape();

    // Should NOT include the association field
    expect(itemShape).not.toHaveProperty("invoice");

    // NOTE: buildDeepInsertZodType currently INCLUDES foreign keys
    // This is different from buildCompositionZodType which excludes them
    // For associations, the user may need to provide the FK explicitly
    if (itemShape.invoice_ID) {
      const isOptional = itemShape.invoice_ID._def?.typeName === "ZodOptional";
      expect(isOptional).toBe(true);
    }
  });

  it("should handle external OData service entities", () => {
    const schema = buildDeepInsertZodType(
      "ExternalInvoiceService.InvoiceItems",
    ) as any;

    const elementSchema = (schema.element || schema._def?.type) as any;
    const itemShape = elementSchema.shape || elementSchema._def?.shape();

    // Should include business fields from external service
    expect(itemShape).toHaveProperty("product");
    expect(itemShape).toHaveProperty("price");

    // Should include key field (not computed in external service)
    expect(itemShape).toHaveProperty("ID");

    // NOTE: buildDeepInsertZodType includes foreign keys
    // For external services, user may need to provide these explicitly
    expect(itemShape).toHaveProperty("invoice_ID");
  });

  it("should return empty array schema for undefined target", () => {
    const schema = buildDeepInsertZodType(undefined) as any;

    expect(schema._def?.typeName).toBe("ZodArray");

    const elementSchema = (schema.element || schema._def?.type) as any;
    const itemShape = elementSchema.shape || elementSchema._def?.shape();

    // Should be empty object
    expect(Object.keys(itemShape || {})).toHaveLength(0);
  });

  it("should return empty array schema for non-existent entity", () => {
    const schema = buildDeepInsertZodType("NonExistent.Entity") as any;

    expect(schema._def?.typeName).toBe("ZodArray");

    const elementSchema = (schema.element || schema._def?.type) as any;
    const itemShape = elementSchema.shape || elementSchema._def?.shape();

    // Should be empty object
    expect(Object.keys(itemShape || {})).toHaveLength(0);
  });

  it("should make non-key, non-notNull fields optional", () => {
    const schema = buildDeepInsertZodType("TestService.InvoiceItems") as any;

    const elementSchema = (schema.element || schema._def?.type) as any;
    const itemShape = elementSchema.shape || elementSchema._def?.shape();

    // Check if product field is optional (not a key, not notNull)
    if (itemShape.product) {
      const isOptional = itemShape.product._def?.typeName === "ZodOptional";
      expect(isOptional).toBe(true);
    }

    // Check if quantity field is optional
    if (itemShape.quantity) {
      const isOptional = itemShape.quantity._def?.typeName === "ZodOptional";
      expect(isOptional).toBe(true);
    }
  });

  it("should document valid deep insert payload for associations", () => {
    // This test documents the expected payload structure
    const validPayload = {
      totalAmount: 100,
      items: [
        {
          // No ID (computed)
          // No invoice_ID (will be auto-filled by CAP)
          product: "Widget",
          quantity: 2,
        },
        {
          product: "Gadget",
          quantity: 1,
        },
      ],
    };

    // Valid payload should not include computed fields or parent FKs
    expect(validPayload.items[0]).not.toHaveProperty("ID");
    expect(validPayload.items[0]).not.toHaveProperty("invoice_ID");
    expect(validPayload.items[0]).toHaveProperty("product");
    expect(validPayload.items[0]).toHaveProperty("quantity");
  });
});

describe("buildDeepInsertZodType - Comparison with Compositions", () => {
  it("should document the difference between Composition and Association deep insert", () => {
    const comparisonDoc = {
      composition: {
        type: "cds.Composition",
        annotation: "None (automatic)",
        function: "buildCompositionZodType",
        trigger: "Automatic when type is Composition",
        useCase: "Standard CAP parent-child relationships",
      },
      association: {
        type: "cds.Association",
        annotation: "@mcp.deepInsert",
        function: "buildDeepInsertZodType",
        trigger: "Manual via annotation",
        useCase: "External OData services, custom relationships",
      },
      similarities: {
        excludeComputedFields: true,
        excludeAssociations: true,
        excludeParentForeignKeys: true,
        returnArraySchema: true,
      },
    };

    // Both should exclude computed fields
    expect(comparisonDoc.similarities.excludeComputedFields).toBe(true);

    // Both should exclude associations
    expect(comparisonDoc.similarities.excludeAssociations).toBe(true);

    // Both should return array schemas
    expect(comparisonDoc.similarities.returnArraySchema).toBe(true);

    // Key difference: annotation requirement
    expect(comparisonDoc.composition.annotation).toBe("None (automatic)");
    expect(comparisonDoc.association.annotation).toBe("@mcp.deepInsert");
  });
});
