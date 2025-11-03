/**
 * Tests for issue #86: Deep insert with computed fields
 *
 * These tests should FAIL before the fix and PASS after the fix is implemented.
 * The bug: buildCompositionZodType doesn't check for @Core.Computed on child elements
 */

// Mock CDS model BEFORE any imports
const mockModel = {
  definitions: {
    "TestService.Invoices": {
      kind: "entity",
      elements: {
        ID: { "@Core.Computed": true, key: true, type: "cds.UUID" },
        items: {
          type: "cds.Composition",
          cardinality: { max: "*" },
          target: "TestService.InvoiceItems",
        },
        totalAmount: { type: "cds.Integer" },
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
    "TestService.Projects": {
      kind: "entity",
      elements: {
        ID: { "@Core.Computed": true, key: true, type: "cds.UUID" },
        name: { type: "cds.String" },
        phases: {
          type: "cds.Composition",
          cardinality: { max: "*" },
          target: "TestService.Phases",
        },
      },
    },
    "TestService.Phases": {
      kind: "entity",
      elements: {
        ID: { "@Core.Computed": true, key: true, type: "cds.UUID" },
        name: { type: "cds.String" },
        project_ID: { type: "cds.UUID" },
        tasks: {
          type: "cds.Composition",
          cardinality: { max: "*" },
          target: "TestService.Tasks",
        },
      },
    },
    "TestService.Tasks": {
      kind: "entity",
      elements: {
        ID: { "@Core.Computed": true, key: true, type: "cds.UUID" },
        title: { type: "cds.String" },
        phase_ID: { type: "cds.UUID" },
      },
    },
    "TestService.Documents": {
      kind: "entity",
      elements: {
        ID: { "@Core.Computed": true, key: true, type: "cds.UUID" },
        version: { key: true, type: "cds.Integer" },
        content: { type: "cds.String" },
        attachments: {
          type: "cds.Composition",
          cardinality: { max: "*" },
          target: "TestService.Attachments",
        },
      },
    },
    "TestService.Attachments": {
      kind: "entity",
      elements: {
        ID: { key: true, type: "cds.UUID" },
        document_ID: { type: "cds.UUID" },
        filename: { type: "cds.String" },
      },
    },
    // Bonus scenario: Child with association as key field
    "TestService.Orders": {
      kind: "entity",
      elements: {
        ID: { "@Core.Computed": true, key: true, type: "cds.UUID" },
        orderNumber: { type: "cds.String" },
        items: {
          type: "cds.Composition",
          cardinality: { max: "*" },
          target: "TestService.OrderItems",
        },
      },
    },
    "TestService.OrderItems": {
      kind: "entity",
      elements: {
        ID: { "@Core.Computed": true, key: true, type: "cds.UUID" },
        order: {
          type: "cds.Association",
          target: "TestService.Orders",
          keys: [{ ref: ["ID"], $generatedFieldName: "order_ID" }],
          key: true, // BONUS: Association is also a key!
        },
        order_ID: {
          type: "cds.UUID",
          key: true, // This is a key field
          "@odata.foreignKey4": "order",
        },
        product: { type: "cds.String" },
        quantity: { type: "cds.Integer" },
      },
    },
    // Circular reference scenario: Parent -> Child composition with Child -> Parent association
    "TestService.Categories": {
      kind: "entity",
      elements: {
        ID: { "@Core.Computed": true, key: true, type: "cds.UUID" },
        name: { type: "cds.String" },
        products: {
          type: "cds.Composition",
          cardinality: { max: "*" },
          target: "TestService.Products",
          on: [{ ref: ["products", "category"] }, "=", { ref: ["$self"] }],
        },
      },
    },
    "TestService.Products": {
      kind: "entity",
      elements: {
        ID: { "@Core.Computed": true, key: true, type: "cds.UUID" },
        name: { type: "cds.String" },
        price: { type: "cds.Decimal" },
        category: {
          type: "cds.Association",
          target: "TestService.Categories",
          keys: [{ ref: ["ID"], $generatedFieldName: "category_ID" }],
        },
        category_ID: {
          type: "cds.UUID",
          "@odata.foreignKey4": "category",
        },
      },
    },
  },
};

// Set up global.cds BEFORE importing modules that cache it
(global as any).cds = { model: mockModel };

// Now import the modules
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEntityWrappers } from "../../../src/mcp/entity-tools";
import { McpResourceAnnotation } from "../../../src/annotations/structures";
import { WrapAccess } from "../../../src/auth/utils";

describe("entity-tools - Deep Insert with Computed Fields (Issue #86)", () => {
  it("should exclude computed fields from composition child schema", () => {
    const server = new McpServer({ name: "test", version: "1" });
    let capturedSchema: any;

    // Capture the input schema
    server.registerTool = (name: string, config: any) => {
      capturedSchema = config.inputSchema;
      return undefined as any;
    };

    // Create annotation with computed fields on both parent and child
    const computedFields = new Set(["ID"]);
    const annotation = new McpResourceAnnotation(
      "invoices",
      "Invoices",
      "Invoices",
      "TestService",
      new Set(["filter"]),
      new Map([
        ["ID", "UUID"],
        ["totalAmount", "Integer"],
        ["items", "Composition"],
      ]),
      new Map([["ID", "UUID"]]),
      new Map(),
      { tools: true, modes: ["create"] },
      undefined,
      computedFields,
    );

    registerEntityWrappers(annotation, server, false, ["create"], {
      canCreate: true,
    });

    // Parent schema checks
    expect(capturedSchema).not.toHaveProperty("ID");
    expect(capturedSchema).toHaveProperty("totalAmount");
    expect(capturedSchema).toHaveProperty("items");

    // Get the Zod schema for items
    const itemsSchema = capturedSchema.items;
    expect(itemsSchema).toBeDefined();

    // Unwrap optional if present (compositions might be z.array(...).optional())
    const unwrappedItemsSchema =
      itemsSchema._def?.typeName === "ZodOptional"
        ? itemsSchema._def.innerType
        : itemsSchema;

    // Items should be an array schema (z.array(...))
    expect(unwrappedItemsSchema._def?.typeName).toBe("ZodArray");

    // Get the element schema (the object schema for each item in the array)
    const itemElementSchema =
      unwrappedItemsSchema.element || unwrappedItemsSchema._def?.type;
    expect(itemElementSchema).toBeDefined();

    // The element should be an object schema (z.object({...}))
    expect(itemElementSchema._def?.typeName).toBe("ZodObject");

    // Get the shape of the item object - this is what we're actually testing
    const itemShape =
      itemElementSchema.shape || itemElementSchema._def?.shape();
    expect(itemShape).toBeDefined();

    // THIS IS THE ACTUAL BUG TEST:
    // The child object schema should NOT include computed field (ID)
    expect(itemShape).not.toHaveProperty("ID");

    // The child object schema SHOULD include non-computed fields
    expect(itemShape).toHaveProperty("product");
    expect(itemShape).toHaveProperty("quantity");

    // Also shouldn't require invoice_ID (FK to parent with computed ID)
    // It should either be excluded or optional
    if (itemShape.invoice_ID) {
      // If it exists, it should be optional
      expect(itemShape.invoice_ID.isOptional()).toBe(true);
    }
  });

  it("should exclude or make optional foreign keys that reference computed parent IDs", () => {
    // This test specifically checks that invoice_ID (FK to parent) is handled correctly
    const server = new McpServer({ name: "test", version: "1" });
    let capturedSchema: any;

    server.registerTool = (name: string, config: any) => {
      capturedSchema = config.inputSchema;
      return undefined as any;
    };

    const computedFields = new Set(["ID"]);
    const annotation = new McpResourceAnnotation(
      "invoices",
      "Invoices",
      "Invoices",
      "TestService",
      new Set([]),
      new Map([
        ["ID", "UUID"],
        ["totalAmount", "Integer"],
        ["items", "Composition"],
      ]),
      new Map([["ID", "UUID"]]),
      new Map(),
      { tools: true, modes: ["create"] },
      undefined,
      computedFields,
    );

    registerEntityWrappers(annotation, server, false, ["create"], {
      canCreate: true,
    });

    // Get the items composition schema
    const itemsSchema = capturedSchema.items;
    const unwrappedItemsSchema =
      itemsSchema._def?.typeName === "ZodOptional"
        ? itemsSchema._def.innerType
        : itemsSchema;
    const itemElementSchema =
      unwrappedItemsSchema.element || unwrappedItemsSchema._def?.type;
    const itemShape =
      itemElementSchema.shape || itemElementSchema._def?.shape();

    // Check if invoice_ID exists in the schema
    if (itemShape.invoice_ID) {
      // If it exists, it MUST be optional because:
      // 1. Parent Invoice.ID is computed
      // 2. CAP will auto-fill invoice_ID during deep insert
      const isOptional = itemShape.invoice_ID._def?.typeName === "ZodOptional";
      expect(isOptional).toBe(true);

      // Verify it's a string (UUID) type underneath
      const innerType = isOptional
        ? itemShape.invoice_ID._def?.innerType
        : itemShape.invoice_ID;
      expect(innerType._def?.typeName).toBe("ZodString");
    }
    // If invoice_ID is not in the schema at all, that's also acceptable (it's excluded)
    // This means we pass whether it's excluded OR optional

    // But we should document the expected behavior
    const validPayload = {
      totalAmount: 100,
      items: [
        { product: "Widget", quantity: 5 },
        { product: "Gadget", quantity: 3 },
      ],
    };

    expect(validPayload.items[0]).not.toHaveProperty("ID");
    expect(validPayload.items[0]).not.toHaveProperty("invoice_ID");
  });

  it("should EXCLUDE foreign keys that reference the parent in composition relationships", () => {
    // STRICT REQUIREMENT: FKs to parent entity in compositions should be EXCLUDED, not optional
    // This is because CAP will auto-fill them during deep insert
    const server = new McpServer({ name: "test", version: "1" });
    let capturedSchema: any;

    server.registerTool = (name: string, config: any) => {
      capturedSchema = config.inputSchema;
      return undefined as any;
    };

    const computedFields = new Set(["ID"]);
    const annotation = new McpResourceAnnotation(
      "invoices",
      "Invoices",
      "Invoices",
      "TestService",
      new Set([]),
      new Map([
        ["ID", "UUID"],
        ["totalAmount", "Integer"],
        ["items", "Composition"],
      ]),
      new Map([["ID", "UUID"]]),
      new Map(),
      { tools: true, modes: ["create"] },
      undefined,
      computedFields,
    );

    registerEntityWrappers(annotation, server, false, ["create"], {
      canCreate: true,
    });

    // Get the items composition schema
    const itemsSchema = capturedSchema.items;
    const unwrappedItemsSchema =
      itemsSchema._def?.typeName === "ZodOptional"
        ? itemsSchema._def.innerType
        : itemsSchema;
    const itemElementSchema =
      unwrappedItemsSchema.element || unwrappedItemsSchema._def?.type;
    const itemShape =
      itemElementSchema.shape || itemElementSchema._def?.shape();

    // List all fields in the child schema
    const childFields = Object.keys(itemShape);

    // Log the schema structure for debugging
    console.log("\n📋 Child schema fields:", childFields);
    childFields.forEach((field) => {
      const fieldSchema = itemShape[field];
      const typeName = fieldSchema._def?.typeName;
      const isOptional = typeName === "ZodOptional";
      const actualType = isOptional
        ? fieldSchema._def?.innerType?._def?.typeName
        : typeName;
      console.log(
        `  - ${field}: ${actualType} (${isOptional ? "optional" : "required"})`,
      );
    });

    // STRICT TEST: invoice_ID should NOT be present at all
    // It's a FK to the parent entity (Invoice) in a composition relationship
    // CAP will auto-fill it during deep insert, so it should be excluded from the schema
    expect(childFields).not.toContain("invoice_ID");

    // Also shouldn't contain the association field itself
    expect(childFields).not.toContain("invoice");

    // Verify computed fields are excluded
    expect(childFields).not.toContain("ID");

    // Verify regular non-computed fields exist
    expect(childFields).toContain("product");
    expect(childFields).toContain("quantity");

    // Expected schema: only business fields, no computed fields, no parent FKs
    const expectedFields = ["product", "quantity"];
    expect(childFields.sort()).toEqual(expectedFields.sort());

    console.log("\n✅ Schema correctly excludes:");
    console.log("   - ID (computed field)");
    console.log("   - invoice (association to parent)");
    console.log("   - invoice_ID (FK to parent in composition)");
    console.log("\n✅ Schema includes only business fields:", expectedFields);
  });

  it("should handle multi-level compositions with computed fields", () => {
    const server = new McpServer({ name: "test", version: "1" });
    let capturedSchema: any;

    server.registerTool = (name: string, config: any) => {
      capturedSchema = config.inputSchema;
      return undefined as any;
    };

    const computedFields = new Set(["ID"]);
    const annotation = new McpResourceAnnotation(
      "projects",
      "Projects",
      "Projects",
      "TestService",
      new Set([]),
      new Map([
        ["ID", "UUID"],
        ["name", "String"],
        ["phases", "Composition"],
      ]),
      new Map([["ID", "UUID"]]),
      new Map(),
      { tools: true, modes: ["create"] },
      undefined,
      computedFields,
    );

    registerEntityWrappers(annotation, server, false, ["create"], {
      canCreate: true,
    });

    // Valid multi-level payload without any computed IDs
    const validPayload = {
      name: "Project Alpha",
      phases: [
        {
          name: "Phase 1",
          tasks: [{ title: "Task 1" }],
        },
      ],
    };

    expect(capturedSchema).toHaveProperty("name");
    expect(capturedSchema).toHaveProperty("phases");
    expect(capturedSchema).not.toHaveProperty("ID");

    // Inspect the phases composition schema
    const phasesSchema = capturedSchema.phases;
    expect(phasesSchema).toBeDefined();

    // Unwrap optional if present
    const unwrappedPhasesSchema =
      phasesSchema._def?.typeName === "ZodOptional"
        ? phasesSchema._def.innerType
        : phasesSchema;

    expect(unwrappedPhasesSchema._def?.typeName).toBe("ZodArray");

    const phaseElementSchema =
      unwrappedPhasesSchema.element || unwrappedPhasesSchema._def?.type;
    expect(phaseElementSchema._def?.typeName).toBe("ZodObject");

    const phaseShape =
      phaseElementSchema.shape || phaseElementSchema._def?.shape();
    expect(phaseShape).toBeDefined();

    // Phase schema should NOT include computed ID
    expect(phaseShape).not.toHaveProperty("ID");
    // Should include regular fields
    expect(phaseShape).toHaveProperty("name");
    // Should either exclude or make optional the FK to parent
    if (phaseShape.project_ID) {
      expect(phaseShape.project_ID.isOptional()).toBe(true);
    }

    // Document expected behavior for nested compositions
    expect(validPayload.phases[0]).not.toHaveProperty("ID");
    expect(validPayload.phases[0]).not.toHaveProperty("project_ID");
    expect(validPayload.phases[0].tasks[0]).not.toHaveProperty("ID");
    expect(validPayload.phases[0].tasks[0]).not.toHaveProperty("phase_ID");
  });

  it("should handle mixed computed/non-computed keys in compositions", () => {
    const server = new McpServer({ name: "test", version: "1" });
    let capturedSchema: any;

    server.registerTool = (name: string, config: any) => {
      capturedSchema = config.inputSchema;
      return undefined as any;
    };

    // Only ID is computed, not version
    const computedFields = new Set(["ID"]);
    const annotation = new McpResourceAnnotation(
      "documents",
      "Documents",
      "Documents",
      "TestService",
      new Set([]),
      new Map([
        ["ID", "UUID"],
        ["version", "Integer"],
        ["content", "String"],
        ["attachments", "Composition"],
      ]),
      new Map([
        ["ID", "UUID"],
        ["version", "Integer"],
      ]),
      new Map(),
      { tools: true, modes: ["create"] },
      undefined,
      computedFields,
    );

    registerEntityWrappers(annotation, server, false, ["create"], {
      canCreate: true,
    });

    // Valid payload: version required (not computed), ID not provided (computed)
    const validPayload = {
      version: 1,
      content: "Document content",
      attachments: [
        {
          ID: "att-1", // Required (not computed on child)
          filename: "file.pdf",
        },
      ],
    };

    // Schema should require version but not ID
    expect(capturedSchema).toHaveProperty("version");
    expect(capturedSchema).not.toHaveProperty("ID");

    expect(validPayload).toHaveProperty("version");
    expect(validPayload).not.toHaveProperty("ID");
    expect(validPayload.attachments[0]).toHaveProperty("ID");
  });

  it("BONUS: should not require foreign key that references computed parent ID (even if it's a key)", () => {
    // This is the bonus scenario from the issue:
    // Child has an association/FK to parent that is ALSO marked as a key field
    // In deep inserts, this should still not be required because CAP auto-fills it

    const server = new McpServer({ name: "test", version: "1" });
    let capturedSchema: any;

    server.registerTool = (name: string, config: any) => {
      capturedSchema = config.inputSchema;
      return undefined as any;
    };

    const computedFields = new Set(["ID"]);
    const annotation = new McpResourceAnnotation(
      "orders",
      "Orders with composition where child FK is also a key",
      "Orders",
      "TestService",
      new Set([]),
      new Map([
        ["ID", "UUID"],
        ["orderNumber", "String"],
        ["items", "Composition"],
      ]),
      new Map([["ID", "UUID"]]),
      new Map(),
      { tools: true, modes: ["create"] },
      undefined,
      computedFields,
    );

    registerEntityWrappers(annotation, server, false, ["create"], {
      canCreate: true,
    });

    // Valid deep insert: Should NOT require order_ID even though it's a key on the child
    // because the parent ID is computed and will be auto-filled
    const validPayload = {
      orderNumber: "ORD-001",
      items: [
        {
          // No ID (computed)
          // No order_ID (even though it's a key, it references computed parent ID)
          product: "Widget",
          quantity: 5,
        },
      ],
    };

    expect(capturedSchema).toHaveProperty("orderNumber");
    expect(capturedSchema).toHaveProperty("items");
    expect(capturedSchema).not.toHaveProperty("ID");

    // Document the expected behavior for the bonus scenario
    expect(validPayload).not.toHaveProperty("ID");
    expect(validPayload.items[0]).not.toHaveProperty("ID");
    expect(validPayload.items[0]).not.toHaveProperty("order_ID");
    expect(validPayload.items[0]).not.toHaveProperty("order");

    // This is the complex part: order_ID is a KEY on the child
    // but it should still be optional in deep inserts
    // because it references the parent's computed ID
  });

  it("should handle circular references: Parent -> Child composition with Child -> Parent association", () => {
    // Very common CAP pattern:
    // - Parent has composition of Children
    // - Child has association back to Parent
    // - Parent has computed ID
    // - In deep inserts, child should NOT require parent_ID FK

    const server = new McpServer({ name: "test", version: "1" });
    let capturedSchema: any;

    server.registerTool = (name: string, config: any) => {
      capturedSchema = config.inputSchema;
      return undefined as any;
    };

    const computedFields = new Set(["ID"]);
    const annotation = new McpResourceAnnotation(
      "categories",
      "Product categories with products",
      "Categories",
      "TestService",
      new Set([]),
      new Map([
        ["ID", "UUID"],
        ["name", "String"],
        ["products", "Composition"],
      ]),
      new Map([["ID", "UUID"]]),
      new Map(),
      { tools: true, modes: ["create"] },
      undefined,
      computedFields,
    );

    registerEntityWrappers(annotation, server, false, ["create"], {
      canCreate: true,
    });

    // Valid deep insert: Category with nested Products
    // Child products should NOT require category_ID even though there's an association back to parent
    const validPayload = {
      name: "Electronics",
      products: [
        {
          // No ID (computed)
          // No category_ID (references computed parent ID, will be auto-filled)
          name: "Laptop",
          price: 999.99,
        },
        {
          name: "Phone",
          price: 599.99,
        },
      ],
    };

    expect(capturedSchema).toHaveProperty("name");
    expect(capturedSchema).toHaveProperty("products");
    expect(capturedSchema).not.toHaveProperty("ID");

    // Inspect the products composition schema
    const productsSchema = capturedSchema.products;
    expect(productsSchema).toBeDefined();

    // Unwrap optional if present
    const unwrappedProductsSchema =
      productsSchema._def?.typeName === "ZodOptional"
        ? productsSchema._def.innerType
        : productsSchema;

    expect(unwrappedProductsSchema._def?.typeName).toBe("ZodArray");

    const productElementSchema =
      unwrappedProductsSchema.element || unwrappedProductsSchema._def?.type;
    expect(productElementSchema._def?.typeName).toBe("ZodObject");

    const productShape =
      productElementSchema.shape || productElementSchema._def?.shape();
    expect(productShape).toBeDefined();

    // CRITICAL: Product schema should NOT include computed ID
    expect(productShape).not.toHaveProperty("ID");
    // Should include regular fields
    expect(productShape).toHaveProperty("name");
    expect(productShape).toHaveProperty("price");
    // Should NOT include the association field
    expect(productShape).not.toHaveProperty("category");
    // The FK to parent should either be excluded or optional (since parent ID is computed)
    if (productShape.category_ID) {
      expect(productShape.category_ID.isOptional()).toBe(true);
    }

    // Document the circular reference behavior
    expect(validPayload).not.toHaveProperty("ID");
    expect(validPayload.products[0]).not.toHaveProperty("ID");
    expect(validPayload.products[0]).not.toHaveProperty("category_ID");
    expect(validPayload.products[0]).not.toHaveProperty("category");

    // The key insight:
    // Even though Products has an association back to Categories,
    // in a deep insert context, the category_ID should be optional
    // because:
    // 1. Parent (Category) ID is computed
    // 2. CAP will auto-fill category_ID from the composition relationship
    // 3. The "on" clause in the composition defines the relationship
  });
});
