import { csn } from "@sap/cds";

const model: csn.CSN = {
  definitions: {
    TestService: {
      kind: "service",
    },
    "TestService.Invoices": {
      kind: "entity",
      "@mcp.name": "Invoices",
      "@mcp.description": "Invoices",
      "@mcp.resource": true,
      "@mcp.wrap": ["create"],
      "@readonly": true,
      elements: {
        ID: { "@Core.Computed": true, key: true, type: "cds.UUID" },
        items: {
          type: "cds.Composition",
          cardinality: { max: "*" },
          target: "InvoicingService.dbInvoiceItems",
          on: [{ ref: ["items", "invoice"] }, "=", { ref: ["$self"] }],
        },
        totalAmount: { type: "cds.Integer" },
      },
      "@Capabilities.DeleteRestrictions.Deletable": false,
      "@Capabilities.InsertRestrictions.Insertable": false,
      "@Capabilities.UpdateRestrictions.Updatable": false,
      projection: { from: { ref: ["dbInvoices"] } },
    },
    dbInvoices: {
      kind: "entity",
      elements: {
        ID: { "@Core.Computed": true, key: true, type: "cds.UUID" },
        items: {
          type: "cds.Composition",
          cardinality: { max: "*" },
          target: "dbInvoiceItems",
          on: [{ ref: ["items", "invoice"] }, "=", { ref: ["$self"] }],
        },
        totalAmount: { type: "cds.Integer" },
      },
    },
    dbInvoiceItems: {
      kind: "entity",
      elements: {
        ID: { "@Core.Computed": true, key: true, type: "cds.UUID" },
        invoice: {
          type: "cds.Association",
          target: "dbInvoices",
          keys: [{ ref: ["ID"], $generatedFieldName: "invoice_ID" }],
        },
        invoice_ID: { type: "cds.UUID", "@odata.foreignKey4": "invoice" },
        product: { type: "cds.String" },
        quantity: { type: "cds.Integer" },
      },
    },
  },
} as any;

describe("Annotation Parsing - Deep Insert with Computed Fields", () => {
  const { parseDefinitions } = require("../../../src/annotations/parser");
  const {
    McpResourceAnnotation,
  } = require("../../../src/annotations/structures");

  it("Should parse computed fields on parent entity", () => {
    const result = parseDefinitions(model);

    expect(result.size).toBeGreaterThan(0);
    const annotation = result.get("TestService.Invoices") as any;
    expect(annotation).toBeInstanceOf(McpResourceAnnotation);

    // Verify parent computed fields are detected
    expect(annotation.computedFields).toBeDefined();
    expect(annotation.computedFields.has("ID")).toBe(true);
  });

  it("Should detect composition relationships in parent entity", () => {
    const result = parseDefinitions(model);

    const annotation = result.get("TestService.Invoices") as any;
    expect(annotation).toBeInstanceOf(McpResourceAnnotation);

    // Verify items composition is detected
    const properties = annotation.properties;
    expect(properties.has("items")).toBe(true);
    expect(properties.get("items")).toMatch(/Composition/i);
  });

  it("Should parse child entity and detect its computed fields", () => {
    // The child entity (dbInvoiceItems) has computed ID field
    // This tests that we can correctly identify computed fields in potential composition targets
    const childModel = {
      definitions: {
        TestService: {
          kind: "service",
        },
        "TestService.InvoiceItems": {
          kind: "entity",
          "@mcp.name": "Invoice Items",
          "@mcp.description": "Invoice line items",
          "@mcp.resource": true,
          elements: {
            ID: { "@Core.Computed": true, key: true, type: "cds.UUID" },
            product: { type: "cds.String" },
            quantity: { type: "cds.Integer" },
          },
        },
        dbInvoiceItems: {
          kind: "entity",
          elements: {
            ID: { "@Core.Computed": true, key: true, type: "cds.UUID" },
            product: { type: "cds.String" },
            quantity: { type: "cds.Integer" },
          },
        },
      },
    } as any;

    const result = parseDefinitions(childModel);
    const annotation = result.get("TestService.InvoiceItems") as any;

    expect(annotation).toBeInstanceOf(McpResourceAnnotation);
    expect(annotation.computedFields).toBeDefined();
    expect(annotation.computedFields.has("ID")).toBe(true);
    expect(annotation.computedFields.has("product")).toBe(false);
    expect(annotation.computedFields.has("quantity")).toBe(false);
  });

  it("Should handle deep inserts with parent foreign keys that reference computed IDs", () => {
    // Test that foreign keys referencing parent's computed ID are detected
    const nestedModel = {
      definitions: {
        TestService: {
          kind: "service",
        },
        "TestService.Orders": {
          kind: "entity",
          "@mcp.name": "Orders",
          "@mcp.description": "Customer orders",
          "@mcp.resource": true,
          "@mcp.wrap": ["create"],
          elements: {
            ID: { "@Core.Computed": true, key: true, type: "cds.UUID" },
            orderItems: {
              type: "cds.Composition",
              cardinality: { max: "*" },
              target: "TestService.OrderItems",
              on: [{ ref: ["orderItems", "order"] }, "=", { ref: ["$self"] }],
            },
            total: { type: "cds.Decimal" },
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
            },
            order_ID: { type: "cds.UUID", "@odata.foreignKey4": "order" },
            product: { type: "cds.String" },
            quantity: { type: "cds.Integer" },
          },
        },
      },
    } as any;

    const result = parseDefinitions(nestedModel);
    const parentAnnotation = result.get("TestService.Orders") as any;

    expect(parentAnnotation).toBeInstanceOf(McpResourceAnnotation);

    // Parent should have computed ID
    expect(parentAnnotation.computedFields.has("ID")).toBe(true);

    // Composition should be detected
    expect(parentAnnotation.properties.has("orderItems")).toBe(true);
  });

  it("Should handle multiple composition levels with computed fields", () => {
    // Test parent -> child -> grandchild all with computed IDs
    const multiLevelModel = {
      definitions: {
        TestService: {
          kind: "service",
        },
        "TestService.Projects": {
          kind: "entity",
          "@mcp.name": "Projects",
          "@mcp.description": "Projects with phases and tasks",
          "@mcp.resource": true,
          "@mcp.wrap": ["create"],
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
      },
    } as any;

    const result = parseDefinitions(multiLevelModel);
    const projectAnnotation = result.get("TestService.Projects") as any;

    expect(projectAnnotation).toBeInstanceOf(McpResourceAnnotation);

    // All levels should have computed IDs detected
    expect(projectAnnotation.computedFields.has("ID")).toBe(true);
    expect(projectAnnotation.properties.has("phases")).toBe(true);
  });

  it("Should handle mixed scenarios with some computed and some non-computed keys", () => {
    const mixedModel = {
      definitions: {
        TestService: {
          kind: "service",
        },
        "TestService.Documents": {
          kind: "entity",
          "@mcp.name": "Documents",
          "@mcp.description": "Documents with manual and auto IDs",
          "@mcp.resource": true,
          "@mcp.wrap": ["create"],
          elements: {
            ID: { "@Core.Computed": true, key: true, type: "cds.UUID" },
            version: { key: true, type: "cds.Integer" }, // Non-computed key
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
            ID: { key: true, type: "cds.UUID" }, // NOT computed
            document_ID: { type: "cds.UUID" },
            filename: { type: "cds.String" },
          },
        },
      },
    } as any;

    const result = parseDefinitions(mixedModel);
    const docAnnotation = result.get("TestService.Documents") as any;

    expect(docAnnotation).toBeInstanceOf(McpResourceAnnotation);

    // Only ID should be computed, not version
    expect(docAnnotation.computedFields.has("ID")).toBe(true);
    expect(docAnnotation.computedFields.has("version")).toBe(false);

    // Should have both keys
    expect(docAnnotation.resourceKeys.has("ID")).toBe(true);
    expect(docAnnotation.resourceKeys.has("version")).toBe(true);
  });

  it("Should ignore relational foreign key of parent in deep inserts with computed parent ID", () => {
    // Child items should not need to provide invoice_ID when parent Invoice ID is computed
    const result = parseDefinitions(model);
    const annotation = result.get("TestService.Invoices") as any;

    expect(annotation).toBeInstanceOf(McpResourceAnnotation);

    // Parent ID is computed
    expect(annotation.computedFields.has("ID")).toBe(true);

    // Composition relationship exists
    expect(annotation.properties.has("items")).toBe(true);

    // This test documents the expected behavior:
    // When creating an Invoice with items, the items should not require:
    // 1. items.ID (because it's computed on child)
    // 2. items.invoice_ID (because parent ID is computed and will be auto-filled)
  });

  it("Should handle multi-key relationships in deep inserts", () => {
    const multiKeyModel = {
      definitions: {
        TestService: {
          kind: "service",
        },
        "TestService.Organizations": {
          kind: "entity",
          "@mcp.name": "Organizations",
          "@mcp.description": "Organizations with departments",
          "@mcp.resource": true,
          "@mcp.wrap": ["create"],
          elements: {
            ID: { "@Core.Computed": true, key: true, type: "cds.UUID" },
            code: { key: true, type: "cds.String" }, // Manual multi-key
            name: { type: "cds.String" },
            departments: {
              type: "cds.Composition",
              cardinality: { max: "*" },
              target: "TestService.Departments",
            },
          },
        },
        "TestService.Departments": {
          kind: "entity",
          elements: {
            ID: { "@Core.Computed": true, key: true, type: "cds.UUID" },
            org_ID: { type: "cds.UUID", "@odata.foreignKey4": "org" },
            org_code: { type: "cds.String" },
            name: { type: "cds.String" },
          },
        },
      },
    } as any;

    const result = parseDefinitions(multiKeyModel);
    const orgAnnotation = result.get("TestService.Organizations") as any;

    expect(orgAnnotation).toBeInstanceOf(McpResourceAnnotation);

    // ID is computed, code is not
    expect(orgAnnotation.computedFields.has("ID")).toBe(true);
    expect(orgAnnotation.computedFields.has("code")).toBe(false);

    // Both should be keys
    expect(orgAnnotation.resourceKeys.has("ID")).toBe(true);
    expect(orgAnnotation.resourceKeys.has("code")).toBe(true);

    // In deep insert scenario:
    // - org.ID should be optional (computed)
    // - org.code MUST be provided (not computed)
    // - departments[].ID should be optional (computed)
    // - departments[].org_ID can be optional (will be filled from parent)
    // - departments[].org_code can be optional (will be filled from parent.code)
  });

  it("BONUS: Should handle foreign keys that are also key fields in deep inserts", () => {
    // This tests the bonus scenario where:
    // 1. Parent has computed ID
    // 2. Child has a FK to parent that is ALSO marked as a key field
    // 3. In deep inserts, this FK-key should still be optional

    const bonusModel = {
      definitions: {
        TestService: {
          kind: "service",
        },
        "TestService.Orders": {
          kind: "entity",
          "@mcp.name": "Orders",
          "@mcp.description": "Orders",
          "@mcp.resource": true,
          "@mcp.wrap": ["create"],
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
              key: true, // Association is a key!
            },
            order_ID: {
              type: "cds.UUID",
              key: true, // FK is a key field
              "@odata.foreignKey4": "order",
            },
            product: { type: "cds.String" },
            quantity: { type: "cds.Integer" },
          },
        },
      },
    } as any;

    const result = parseDefinitions(bonusModel);
    const orderAnnotation = result.get("TestService.Orders") as any;

    expect(orderAnnotation).toBeInstanceOf(McpResourceAnnotation);

    // Parent ID is computed
    expect(orderAnnotation.computedFields.has("ID")).toBe(true);

    // Has composition
    expect(orderAnnotation.properties.has("items")).toBe(true);

    // The tricky part documented:
    // In OrderItems:
    // - ID is computed (should be optional)
    // - order_ID is a KEY but references parent's computed ID
    // - In deep inserts, order_ID should ALSO be optional
    //   because CAP will auto-fill it from the parent

    // This scenario requires special handling in buildCompositionZodType:
    // 1. Check if field is computed -> skip
    // 2. Check if field is a key referencing computed parent ID -> make optional or skip
    // 3. Check if field has @odata.foreignKey4 pointing to composition parent -> make optional
  });

  it("Should handle circular references: Parent -> Child composition with Child -> Parent association", () => {
    // This tests a very common CAP pattern:
    // 1. Parent has a composition of Children
    // 2. Child has an association back to Parent (creating the bidirectional relationship)
    // 3. Parent has computed ID
    // 4. In deep inserts, the child should NOT require parent_ID because:
    //    - Parent ID is computed
    //    - The composition relationship will auto-fill the parent_ID FK

    const circularModel = {
      definitions: {
        TestService: {
          kind: "service",
        },
        "TestService.Categories": {
          kind: "entity",
          "@mcp.name": "Categories",
          "@mcp.description": "Product categories",
          "@mcp.resource": true,
          "@mcp.wrap": ["create"],
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
    } as any;

    const result = parseDefinitions(circularModel);
    const categoryAnnotation = result.get("TestService.Categories") as any;

    expect(categoryAnnotation).toBeInstanceOf(McpResourceAnnotation);

    // Parent (Category) should have computed ID
    expect(categoryAnnotation.computedFields.has("ID")).toBe(true);

    // Composition should be detected
    expect(categoryAnnotation.properties.has("products")).toBe(true);

    // Expected behavior for deep insert:
    // {
    //   "name": "Electronics",
    //   "products": [
    //     {
    //       // No ID (computed)
    //       // No category_ID (parent ID is computed and will be auto-filled by CAP)
    //       "name": "Laptop",
    //       "price": 999.99
    //     }
    //   ]
    // }
    //
    // The child's category_ID should be optional because:
    // 1. It references the parent's computed ID
    // 2. CAP will automatically fill it when processing the composition
    // 3. The composition relationship ("on" clause) defines the link
  });
});
