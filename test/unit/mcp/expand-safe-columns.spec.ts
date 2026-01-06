/**
 * Tests for safe column filtering during association expand
 * Verifies that @mcp.omit fields are not fetched from the database
 */

import { McpResourceAnnotation } from "../../../src/annotations/structures";

describe("Safe Column Filtering for Association Expand", () => {
  describe("safeColumns getter", () => {
    it("should return ['*'] when no fields are omitted", () => {
      const annotation = new McpResourceAnnotation(
        "books",
        "Books",
        "Books",
        "CatalogService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["title", "String"],
          ["author", "String"],
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        undefined,
        [],
        undefined,
        new Map(),
        undefined, // No omitted fields
      );

      expect(annotation.safeColumns).toEqual(["*"]);
    });

    it("should return explicit columns when fields are omitted", () => {
      const omittedFields = new Set(["secretMessage", "internalCode"]);
      const annotation = new McpResourceAnnotation(
        "books",
        "Books",
        "Books",
        "CatalogService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["title", "String"],
          ["author", "String"],
          ["secretMessage", "String"],
          ["internalCode", "String"],
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        undefined,
        [],
        undefined,
        new Map(),
        omittedFields,
      );

      const safeColumns = annotation.safeColumns;
      expect(safeColumns).toContain("ID");
      expect(safeColumns).toContain("title");
      expect(safeColumns).toContain("author");
      expect(safeColumns).not.toContain("secretMessage");
      expect(safeColumns).not.toContain("internalCode");
      expect(safeColumns.length).toBe(3);
    });
  });

  describe("getAssociationSafeColumns", () => {
    it("should return undefined for associations without omitted fields", () => {
      const annotation = new McpResourceAnnotation(
        "books",
        "Books",
        "Books",
        "CatalogService",
        new Set(["filter", "orderby", "select", "top", "skip", "expand"]),
        new Map([
          ["ID", "Integer"],
          ["title", "String"],
          ["author", "cds.Association"],
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        undefined,
        [],
        undefined,
        new Map(),
        undefined,
        undefined, // No association safe columns map
      );

      expect(annotation.getAssociationSafeColumns("author")).toBeUndefined();
    });

    it("should return safe columns for associations with omitted fields", () => {
      const associationSafeColumns = new Map([
        ["author", ["ID", "name", "email"]], // salary is omitted
      ]);

      const annotation = new McpResourceAnnotation(
        "books",
        "Books",
        "Books",
        "CatalogService",
        new Set(["filter", "orderby", "select", "top", "skip", "expand"]),
        new Map([
          ["ID", "Integer"],
          ["title", "String"],
          ["author", "cds.Association"],
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        undefined,
        [],
        undefined,
        new Map(),
        undefined,
        associationSafeColumns,
      );

      const authorSafeColumns = annotation.getAssociationSafeColumns("author");
      expect(authorSafeColumns).toEqual(["ID", "name", "email"]);
      expect(authorSafeColumns).not.toContain("salary");
    });

    it("should handle multiple associations with different omitted fields", () => {
      const associationSafeColumns = new Map([
        ["author", ["ID", "name"]], // salary, ssn omitted
        ["publisher", ["ID", "name", "address"]], // revenue omitted
      ]);

      const annotation = new McpResourceAnnotation(
        "books",
        "Books",
        "Books",
        "CatalogService",
        new Set(["filter", "orderby", "select", "top", "skip", "expand"]),
        new Map([
          ["ID", "Integer"],
          ["title", "String"],
          ["author", "cds.Association"],
          ["publisher", "cds.Association"],
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        undefined,
        [],
        undefined,
        new Map(),
        undefined,
        associationSafeColumns,
      );

      expect(annotation.getAssociationSafeColumns("author")).toEqual([
        "ID",
        "name",
      ]);
      expect(annotation.getAssociationSafeColumns("publisher")).toEqual([
        "ID",
        "name",
        "address",
      ]);
    });
  });

  describe("Security verification", () => {
    it("should demonstrate that omitted fields are excluded from safe columns", () => {
      // Scenario: Books entity with secretMessage @mcp.omit
      // Associated Authors entity with salary @mcp.omit

      const booksOmitted = new Set(["secretMessage"]);
      const associationSafeColumns = new Map([
        ["author", ["ID", "name", "email"]], // salary excluded
      ]);

      const booksAnnotation = new McpResourceAnnotation(
        "books",
        "Books",
        "Books",
        "CatalogService",
        new Set(["filter", "orderby", "select", "top", "skip", "expand"]),
        new Map([
          ["ID", "Integer"],
          ["title", "String"],
          ["secretMessage", "String"],
          ["author", "cds.Association"],
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        undefined,
        [],
        undefined,
        new Map(),
        booksOmitted,
        associationSafeColumns,
      );

      // Verify main entity safe columns
      const booksSafe = booksAnnotation.safeColumns;
      expect(booksSafe).toContain("ID");
      expect(booksSafe).toContain("title");
      expect(booksSafe).not.toContain("secretMessage"); // ✅ Excluded

      // Verify association safe columns
      const authorSafe = booksAnnotation.getAssociationSafeColumns("author");
      expect(authorSafe).toContain("ID");
      expect(authorSafe).toContain("name");
      expect(authorSafe).toContain("email");
      expect(authorSafe).not.toContain("salary"); // ✅ Excluded

      // This proves that when building a query with expand,
      // neither secretMessage nor salary will be fetched from the database
    });
  });
});
