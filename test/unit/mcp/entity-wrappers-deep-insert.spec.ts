/**
 * Specification tests for deep insert operations with computed fields and compositions
 *
 * Issue #86: Computed fields in deep inserts should not be required
 * - Parent entity with computed ID
 * - Child entity (composition) with computed ID
 * - Create tool should not require either ID to be provided
 *
 * These tests document the EXPECTED behavior and serve as specifications for the fix.
 */
describe("entity-tools - Deep Insert with Computed Fields (Specification)", () => {
  describe("Expected behavior documentation", () => {
    it("should document deep insert schema requirements for compositions with computed fields", () => {
      // Scenario: Parent entity (Invoices) with computed ID, containing composition (items)
      // where child entity (InvoiceItems) also has computed ID

      const expectedBehavior = {
        parentEntity: {
          name: "Invoices",
          computedFields: ["ID"],
          hasComposition: true,
          compositionField: "items",
        },
        childEntity: {
          name: "InvoiceItems",
          computedFields: ["ID"],
          foreignKeys: {
            invoice_ID: {
              references: "Invoices.ID",
              isComputedOnParent: true,
            },
          },
        },
        expectedCreateSchema: {
          description:
            "Create schema should exclude computed fields from both parent and child",
          parentRequirements: {
            ID: false, // Computed - should NOT be required or present in schema
            totalAmount: true, // Regular field - should be required
            items: true, // Composition - should be present as array
          },
          childRequirements: {
            ID: false, // Computed - should NOT be required in composition items
            invoice_ID: false, // References computed parent ID - should NOT be required
            product: true, // Regular field - should be required
            quantity: true, // Regular field - should be required
          },
        },
      };

      // Example of valid deep insert payload
      const validPayload = {
        totalAmount: 100,
        items: [
          { product: "Widget", quantity: 5 },
          { product: "Gadget", quantity: 3 },
        ],
      };

      // Assertions to document expected behavior
      expect(expectedBehavior.parentEntity.computedFields).toContain("ID");
      expect(expectedBehavior.childEntity.computedFields).toContain("ID");
      expect(expectedBehavior.expectedCreateSchema.parentRequirements.ID).toBe(
        false,
      );
      expect(expectedBehavior.expectedCreateSchema.childRequirements.ID).toBe(
        false,
      );
      expect(
        expectedBehavior.expectedCreateSchema.childRequirements.invoice_ID,
      ).toBe(false);

      // Valid payload should not include computed fields
      expect(validPayload).not.toHaveProperty("ID");
      expect(validPayload.items[0]).not.toHaveProperty("ID");
      expect(validPayload.items[0]).not.toHaveProperty("invoice_ID");
    });

    it("should document multi-level composition behavior", () => {
      // Scenario: Project -> Phases -> Tasks (all with computed IDs)
      const multiLevelScenario = {
        level1: {
          entity: "Projects",
          computedFields: ["ID"],
          composition: "phases",
        },
        level2: {
          entity: "Phases",
          computedFields: ["ID"],
          foreignKey: "project_ID", // References Project.ID (computed)
          composition: "tasks",
        },
        level3: {
          entity: "Tasks",
          computedFields: ["ID"],
          foreignKey: "phase_ID", // References Phase.ID (computed)
        },
        expectedBehavior: {
          description:
            "All levels should exclude computed IDs and computed foreign keys",
          project_ID_required: false,
          phase_ID_required: false,
          project_tasks_can_omit_all_computed: true,
        },
      };

      const validMultiLevelPayload = {
        name: "Project Alpha",
        phases: [
          {
            name: "Phase 1",
            // No ID, no project_ID
            tasks: [
              {
                title: "Task 1",
                // No ID, no phase_ID
              },
            ],
          },
        ],
      };

      expect(multiLevelScenario.level1.computedFields).toContain("ID");
      expect(multiLevelScenario.level2.computedFields).toContain("ID");
      expect(multiLevelScenario.level3.computedFields).toContain("ID");
      expect(validMultiLevelPayload).not.toHaveProperty("ID");
      expect(validMultiLevelPayload.phases[0]).not.toHaveProperty("ID");
      expect(validMultiLevelPayload.phases[0]).not.toHaveProperty("project_ID");
      expect(validMultiLevelPayload.phases[0].tasks[0]).not.toHaveProperty(
        "ID",
      );
      expect(validMultiLevelPayload.phases[0].tasks[0]).not.toHaveProperty(
        "phase_ID",
      );
    });

    it("should document mixed computed/non-computed key scenarios", () => {
      // Scenario: Entity with multiple keys, some computed, some not
      const mixedKeyScenario = {
        entity: "Documents",
        keys: [
          { name: "ID", type: "UUID", computed: true },
          { name: "version", type: "Integer", computed: false },
        ],
        composition: {
          field: "attachments",
          target: "Attachments",
          childKeys: [{ name: "ID", type: "UUID", computed: false }],
        },
        expectedBehavior: {
          parent_ID_required: false, // Computed
          parent_version_required: true, // Not computed - MUST be provided
          child_ID_required: true, // Not computed - MUST be provided
          child_document_ID_required: false, // References computed parent ID
        },
      };

      const validMixedPayload = {
        version: 1, // Required (not computed)
        content: "Document content",
        attachments: [
          {
            ID: "att-1", // Required (not computed on child)
            filename: "file.pdf",
            // document_ID not required (parent ID is computed)
          },
        ],
      };

      expect(mixedKeyScenario.keys.find((k) => k.name === "ID")?.computed).toBe(
        true,
      );
      expect(
        mixedKeyScenario.keys.find((k) => k.name === "version")?.computed,
      ).toBe(false);
      expect(validMixedPayload).toHaveProperty("version");
      expect(validMixedPayload).not.toHaveProperty("ID");
      expect(validMixedPayload.attachments[0]).toHaveProperty("ID");
      expect(validMixedPayload.attachments[0]).not.toHaveProperty(
        "document_ID",
      );
    });

    it("should document association vs composition handling", () => {
      // Document the difference between associations and compositions
      // in the context of computed fields

      const associationVsComposition = {
        association: {
          description: "Foreign key field that references another entity",
          example: "author_ID",
          inCreateSchema: true, // FK fields appear in schema
          required: false, // Usually optional
        },
        composition: {
          description: "Child entities owned by parent (deep insert)",
          example: "items",
          inCreateSchema: true, // Appears as nested array
          childFieldsWithComputedFK: {
            description:
              "Child fields referencing computed parent IDs should be optional",
            shouldBeRequired: false,
          },
        },
        computedFieldHandling: {
          onParent: "Excluded from create schema entirely",
          onChild: "Excluded from composition element schema",
          foreignKeyToComputedParent:
            "Should be optional/excluded as it will be auto-filled",
        },
      };

      // Association example: Book with author_ID
      const bookWithAssociation = {
        title: "Book Title",
        author_ID: 123, // FK to Author entity - included in schema
      };

      // Composition example: Invoice with items (deep insert)
      const invoiceWithComposition = {
        totalAmount: 100,
        items: [
          {
            // No invoice_ID needed if Invoice.ID is computed
            product: "Widget",
            quantity: 5,
          },
        ],
      };

      expect(associationVsComposition.association.inCreateSchema).toBe(true);
      expect(associationVsComposition.composition.inCreateSchema).toBe(true);
      expect(
        associationVsComposition.composition.childFieldsWithComputedFK
          .shouldBeRequired,
      ).toBe(false);
      expect(bookWithAssociation).toHaveProperty("author_ID");
      expect(invoiceWithComposition.items[0]).not.toHaveProperty("invoice_ID");
    });

    it("should document circular reference pattern: Parent -> Child composition with Child -> Parent association", () => {
      // This is a VERY common pattern in CAP applications:
      // Parent has composition of Children, Child has association back to Parent
      // This creates a bidirectional relationship that's very useful for navigation

      const circularReferencePattern = {
        parent: {
          entity: "Categories",
          computedID: true,
          composition: {
            field: "products",
            target: "Products",
            onClause: "products.category = $self",
          },
        },
        child: {
          entity: "Products",
          computedID: true,
          association: {
            field: "category",
            target: "Categories",
            foreignKey: "category_ID",
          },
        },
        expectedBehavior: {
          description:
            "In deep inserts, child FK should be optional even though there's an association",
          parent_ID_required: false, // Computed
          child_ID_required: false, // Computed
          child_foreignKey_required: false, // Will be auto-filled by CAP from composition
          reason:
            "CAP automatically fills the FK when processing the composition relationship",
        },
      };

      // Valid deep insert payload
      const validCircularPayload = {
        name: "Electronics",
        products: [
          {
            // No ID (computed)
            // No category_ID (will be auto-filled from parent computed ID)
            name: "Laptop",
            price: 999.99,
          },
          {
            name: "Phone",
            price: 599.99,
          },
        ],
      };

      // After creation, CAP will have:
      // 1. Generated Category.ID (computed)
      // 2. Generated each Product.ID (computed)
      // 3. Filled in each Product.category_ID with the parent Category.ID
      // 4. The association Product.category will be navigable back to the parent

      expect(circularReferencePattern.parent.computedID).toBe(true);
      expect(circularReferencePattern.child.computedID).toBe(true);
      expect(
        circularReferencePattern.expectedBehavior.child_foreignKey_required,
      ).toBe(false);
      expect(validCircularPayload).not.toHaveProperty("ID");
      expect(validCircularPayload.products[0]).not.toHaveProperty("ID");
      expect(validCircularPayload.products[0]).not.toHaveProperty(
        "category_ID",
      );
      expect(validCircularPayload.products[0]).not.toHaveProperty("category");
    });
  });

  describe("Implementation requirements", () => {
    it("should document changes needed in buildCompositionZodType", () => {
      // This test documents what needs to change in src/mcp/utils.ts

      const currentImplementation = {
        location: "src/mcp/utils.ts",
        function: "buildCompositionZodType",
        currentBehavior:
          "Iterates through composition target elements and includes all fields except associations",
        issue: "Does not check for @Core.Computed annotation on child elements",
      };

      const requiredChanges = {
        step1: "Access the composition target definition from model",
        step2:
          "For each element in the target, check for @Core.Computed annotation",
        step3:
          "Exclude computed fields from the Zod schema (like parent entities do)",
        step4:
          "Also check if element is a foreign key referencing a computed parent field",
        step5:
          "Make those foreign keys optional or excluded since they will be auto-filled",
      };

      const pseudoCode = `
        function buildCompositionZodType(key, target) {
          const model = cds.model;
          const targetDef = model.definitions[targetProp.target];

          for (const [k, v] of Object.entries(targetDef.elements)) {
            // EXISTING: Skip associations and compositions
            if (parsedType === "Association" || parsedType === "Composition") continue;

            // NEW: Skip computed fields (just like parent entity does)
            const isComputed = v["@Core.Computed"] ||
                               new Map(Object.entries(v).map(([key, value]) =>
                                 [key.toLowerCase(), value])).get("@core.computed");
            if (isComputed) continue;

            // NEW: Check if this is a FK referencing computed parent field
            // If so, make it optional or skip it

            // Add to schema
            const isOptional = !v.key && !v.notNull;
            compProperties.set(k, isOptional ? paramType.optional() : paramType);
          }
        }
      `;

      expect(currentImplementation.function).toBe("buildCompositionZodType");
      expect(requiredChanges.step2).toContain("@Core.Computed");
      expect(requiredChanges.step3).toContain("Exclude computed fields");
      expect(pseudoCode).toContain("isComputed");
    });

    it("should document test coverage requirements", () => {
      // Document what tests should pass after the fix

      const testCoverage = {
        unit: {
          parsing: "Verify computed fields are detected on composition targets",
          schemaGeneration:
            "Verify composition schemas exclude computed fields",
        },
        integration: {
          deepInsert:
            "Verify actual CREATE operations work without computed IDs",
          validation:
            "Verify Zod validation accepts payloads without computed fields",
        },
        scenarios: [
          "Single-level composition with computed parent and child IDs",
          "Multi-level composition (grandparent -> parent -> child)",
          "Mixed keys (some computed, some not)",
          "Foreign keys referencing computed parent IDs",
        ],
      };

      expect(testCoverage.unit.parsing).toContain("computed fields");
      expect(testCoverage.unit.schemaGeneration).toContain("exclude");
      expect(testCoverage.scenarios).toHaveLength(4);
    });
  });
});
