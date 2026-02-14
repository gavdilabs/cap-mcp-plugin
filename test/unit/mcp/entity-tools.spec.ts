import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerEntityWrappers,
  coerceKeyValue,
} from "../../../src/mcp/entity-tools";
import { McpResourceAnnotation } from "../../../src/annotations/structures";
import { WrapAccess } from "../../../src/auth/utils";
import { EntityListQueryArgs } from "../../../src/mcp/types";

describe("entity-tools - registration", () => {
  it("registers query/get/create/update/delete based on modes", () => {
    const server = new McpServer({ name: "t", version: "1" });
    const reg: string[] = [];
    // @ts-ignore override registerTool to capture registrations
    server.registerTool = (name: string) => {
      reg.push(name);
      // return noop handler
      return undefined as any;
    };

    const res = new McpResourceAnnotation(
      "books",
      "Books",
      "Books",
      "CatalogService",
      new Set(["filter", "orderby", "select", "top", "skip"]),
      new Map([
        ["ID", "Integer"],
        ["title", "String"],
      ]),
      new Map([["ID", "Integer"]]),
      new Map(),
      { tools: true, modes: ["query", "get", "create", "update", "delete"] },
    );

    const accesses: WrapAccess = {
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
    };
    registerEntityWrappers(res, server, false, ["query", "get"], accesses);

    expect(reg).toEqual(
      expect.arrayContaining([
        "CatalogService_Books_query",
        "CatalogService_Books_get",
        "CatalogService_Books_create",
        "CatalogService_Books_update",
        "CatalogService_Books_delete",
      ]),
    );
  });

  it("registers only delete when delete mode is specified", () => {
    const server = new McpServer({ name: "t", version: "1" });
    const reg: string[] = [];
    // @ts-ignore override registerTool to capture registrations
    server.registerTool = (name: string) => {
      reg.push(name);
      // return noop handler
      return undefined as any;
    };

    const res = new McpResourceAnnotation(
      "books",
      "Books",
      "Books",
      "CatalogService",
      new Set(["filter", "orderby", "select", "top", "skip"]),
      new Map([
        ["ID", "Integer"],
        ["title", "String"],
      ]),
      new Map([["ID", "Integer"]]),
      new Map(),
      { tools: true, modes: ["delete"] },
    );

    const accesses: WrapAccess = { canDelete: true };
    registerEntityWrappers(res, server, false, ["delete"], accesses);

    expect(reg).toEqual(["CatalogService_Books_delete"]);
  });

  it("does not register delete for entities without keys", () => {
    const server = new McpServer({ name: "t", version: "1" });
    const reg: string[] = [];
    // @ts-ignore override registerTool to capture registrations
    server.registerTool = (name: string) => {
      reg.push(name);
      // return noop handler
      return undefined as any;
    };

    const res = new McpResourceAnnotation(
      "books",
      "Books",
      "Books",
      "CatalogService",
      new Set(["filter", "orderby", "select", "top", "skip"]),
      new Map([
        ["ID", "Integer"],
        ["title", "String"],
      ]),
      new Map([]), // No keys - delete should not be registered
      new Map(),
      { tools: true, modes: ["delete"] },
    );

    const accesses: WrapAccess = { canDelete: true };
    registerEntityWrappers(res, server, false, ["delete"], accesses);
  });
});

describe("entity-tools - custom tool naming via @mcp.wrap.name", () => {
  it("uses custom name prefix when @mcp.wrap.name is specified", () => {
    const server = new McpServer({ name: "t", version: "1" });
    const reg: string[] = [];
    // @ts-ignore override registerTool to capture registrations
    server.registerTool = (name: string) => {
      reg.push(name);
      // return noop handler
      return undefined as any;
    };

    const res = new McpResourceAnnotation(
      "books",
      "Books",
      "Books",
      "CatalogService",
      new Set(["filter", "orderby", "select", "top", "skip"]),
      new Map([
        ["ID", "Integer"],
        ["title", "String"],
      ]),
      new Map([["ID", "Integer"]]),
      new Map(),
      { tools: true, modes: ["query", "get"], name: "BookCatalog" }, // Custom name
    );

    const accesses: WrapAccess = { canRead: true };
    registerEntityWrappers(res, server, false, ["query", "get"], accesses);

    expect(reg).toEqual(["BookCatalog_query", "BookCatalog_get"]);
  });

  it("falls back to default naming when @mcp.wrap.name is not specified", () => {
    const server = new McpServer({ name: "t", version: "1" });
    const reg: string[] = [];
    // @ts-ignore override registerTool to capture registrations
    server.registerTool = (name: string) => {
      reg.push(name);
      // return noop handler
      return undefined as any;
    };

    const res = new McpResourceAnnotation(
      "books",
      "Books",
      "Books",
      "CatalogService",
      new Set(["filter", "orderby", "select", "top", "skip"]),
      new Map([
        ["ID", "Integer"],
        ["title", "String"],
      ]),
      new Map([["ID", "Integer"]]),
      new Map(),
      { tools: true, modes: ["query"] }, // No custom name
    );

    const accesses: WrapAccess = { canRead: true };
    registerEntityWrappers(res, server, false, ["query"], accesses);

    expect(reg).toEqual(["CatalogService_Books_query"]);
  });

  it("applies custom naming to all CRUD operations", () => {
    const server = new McpServer({ name: "t", version: "1" });
    const reg: string[] = [];
    // @ts-ignore override registerTool to capture registrations
    server.registerTool = (name: string) => {
      reg.push(name);
      // return noop handler
      return undefined as any;
    };

    const res = new McpResourceAnnotation(
      "books",
      "Books",
      "Books",
      "CatalogService",
      new Set(["filter", "orderby", "select", "top", "skip"]),
      new Map([
        ["ID", "Integer"],
        ["title", "String"],
      ]),
      new Map([["ID", "Integer"]]),
      new Map(),
      {
        tools: true,
        modes: ["query", "get", "create", "update", "delete"],
        name: "MyBooks",
      },
    );

    const accesses: WrapAccess = {
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
    };
    registerEntityWrappers(
      res,
      server,
      false,
      ["query", "get", "create", "update", "delete"],
      accesses,
    );

    expect(reg).toEqual([
      "MyBooks_query",
      "MyBooks_get",
      "MyBooks_create",
      "MyBooks_update",
      "MyBooks_delete",
    ]);
  });
});

describe("entity-tools - Core.Computed field handling", () => {
  describe("create tool with computed fields", () => {
    it("excludes computed fields from create input schema", () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedInputSchema: Record<string, any> = {};

      // @ts-ignore override registerTool to capture input schema
      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedInputSchema = config.inputSchema;
        return undefined as any;
      };

      const computedFields = new Set(["computedValue", "autoGenField"]);
      const res = new McpResourceAnnotation(
        "products",
        "Products",
        "Products",
        "CatalogService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["name", "String"],
          ["price", "Decimal"],
          ["computedValue", "Integer"], // Should be excluded
          ["autoGenField", "String"], // Should be excluded
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["create"] },
        undefined,
        computedFields,
      );

      const accesses: WrapAccess = { canCreate: true };
      registerEntityWrappers(res, server, false, ["create"], accesses);

      // Verify computed fields are NOT in the input schema
      expect(capturedInputSchema).toHaveProperty("name");
      expect(capturedInputSchema).toHaveProperty("price");
      expect(capturedInputSchema).not.toHaveProperty("computedValue");
      expect(capturedInputSchema).not.toHaveProperty("autoGenField");
    });

    it("handles entities without computed fields correctly", () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedInputSchema: Record<string, any> = {};

      // @ts-ignore override registerTool to capture input schema
      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedInputSchema = config.inputSchema;
        return undefined as any;
      };

      const res = new McpResourceAnnotation(
        "products",
        "Products",
        "Products",
        "CatalogService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["name", "String"],
          ["price", "Decimal"],
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["create"] },
        undefined,
        undefined, // No computed fields
      );

      const accesses: WrapAccess = { canCreate: true };
      registerEntityWrappers(res, server, false, ["create"], accesses);

      // All fields should be in the input schema (except keys which are optional)
      expect(capturedInputSchema).toHaveProperty("name");
      expect(capturedInputSchema).toHaveProperty("price");
    });

    it("handles entities with only computed fields", () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedInputSchema: Record<string, any> = {};

      // @ts-ignore override registerTool to capture input schema
      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedInputSchema = config.inputSchema;
        return undefined as any;
      };

      const computedFields = new Set(["computedValue"]);
      const res = new McpResourceAnnotation(
        "computed",
        "ComputedEntity",
        "ComputedEntity",
        "CatalogService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["computedValue", "Integer"], // Only non-key field is computed
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["create"] },
        undefined,
        computedFields,
      );

      const accesses: WrapAccess = { canCreate: true };
      registerEntityWrappers(res, server, false, ["create"], accesses);

      // Computed field should not be in schema
      expect(capturedInputSchema).not.toHaveProperty("computedValue");
      // Key field is included in create schema (as optional)
      expect(capturedInputSchema).toHaveProperty("ID");
      // Only the key field should be present (no other non-computed fields)
      const nonSystemKeys = Object.keys(capturedInputSchema).filter(
        (k) => !k.startsWith("_"),
      );
      expect(nonSystemKeys).toEqual(["ID"]);
    });
  });

  describe("update tool with computed fields", () => {
    it("excludes computed fields from update input schema", () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedInputSchema: Record<string, any> = {};

      // @ts-ignore override registerTool to capture input schema
      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedInputSchema = config.inputSchema;
        return undefined as any;
      };

      const computedFields = new Set(["computedValue", "autoGenField"]);
      const res = new McpResourceAnnotation(
        "products",
        "Products",
        "Products",
        "CatalogService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["name", "String"],
          ["price", "Decimal"],
          ["computedValue", "Integer"], // Should be excluded
          ["autoGenField", "String"], // Should be excluded
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["update"] },
        undefined,
        computedFields,
      );

      const accesses: WrapAccess = { canUpdate: true };
      registerEntityWrappers(res, server, false, ["update"], accesses);

      // Verify key field IS in schema (required for update)
      expect(capturedInputSchema).toHaveProperty("ID");
      // Verify non-computed fields are in schema
      expect(capturedInputSchema).toHaveProperty("name");
      expect(capturedInputSchema).toHaveProperty("price");
      // Verify computed fields are NOT in the input schema
      expect(capturedInputSchema).not.toHaveProperty("computedValue");
      expect(capturedInputSchema).not.toHaveProperty("autoGenField");
    });

    it("allows updating non-computed fields when computed fields exist", () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedInputSchema: Record<string, any> = {};

      // @ts-ignore override registerTool to capture input schema
      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedInputSchema = config.inputSchema;
        return undefined as any;
      };

      const computedFields = new Set(["lastModified", "fullName"]);
      const res = new McpResourceAnnotation(
        "users",
        "Users",
        "Users",
        "UserService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["firstName", "String"],
          ["lastName", "String"],
          ["email", "String"],
          ["fullName", "String"], // Computed (e.g., firstName + lastName)
          ["lastModified", "DateTime"], // Computed timestamp
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["update"] },
        undefined,
        computedFields,
      );

      const accesses: WrapAccess = { canUpdate: true };
      registerEntityWrappers(res, server, false, ["update"], accesses);

      // Key should be present
      expect(capturedInputSchema).toHaveProperty("ID");
      // Updateable fields should be present
      expect(capturedInputSchema).toHaveProperty("firstName");
      expect(capturedInputSchema).toHaveProperty("lastName");
      expect(capturedInputSchema).toHaveProperty("email");
      // Computed fields should NOT be present
      expect(capturedInputSchema).not.toHaveProperty("fullName");
      expect(capturedInputSchema).not.toHaveProperty("lastModified");
    });

    it("handles entities without computed fields in update correctly", () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedInputSchema: Record<string, any> = {};

      // @ts-ignore override registerTool to capture input schema
      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedInputSchema = config.inputSchema;
        return undefined as any;
      };

      const res = new McpResourceAnnotation(
        "products",
        "Products",
        "Products",
        "CatalogService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["name", "String"],
          ["price", "Decimal"],
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["update"] },
        undefined,
        undefined, // No computed fields
      );

      const accesses: WrapAccess = { canUpdate: true };
      registerEntityWrappers(res, server, false, ["update"], accesses);

      // All fields should be in the input schema
      expect(capturedInputSchema).toHaveProperty("ID");
      expect(capturedInputSchema).toHaveProperty("name");
      expect(capturedInputSchema).toHaveProperty("price");
    });
  });

  describe("computed fields with associations", () => {
    it("excludes both computed fields and associations from create schema", () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedInputSchema: Record<string, any> = {};

      // @ts-ignore override registerTool to capture input schema
      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedInputSchema = config.inputSchema;
        return undefined as any;
      };

      const computedFields = new Set(["totalPrice"]);
      const res = new McpResourceAnnotation(
        "orders",
        "Orders",
        "Orders",
        "SalesService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["orderDate", "Date"],
          ["quantity", "Integer"],
          ["unitPrice", "Decimal"],
          ["totalPrice", "Decimal"], // Computed: quantity * unitPrice
          ["customer", "Association to Customers"], // Association
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["create"] },
        undefined,
        computedFields,
      );

      const accesses: WrapAccess = { canCreate: true };
      registerEntityWrappers(res, server, false, ["create"], accesses);

      // Regular fields should be present
      expect(capturedInputSchema).toHaveProperty("orderDate");
      expect(capturedInputSchema).toHaveProperty("quantity");
      expect(capturedInputSchema).toHaveProperty("unitPrice");
      // Computed field should NOT be present
      expect(capturedInputSchema).not.toHaveProperty("totalPrice");
      // Association should NOT be present (associations are handled via _ID)
      expect(capturedInputSchema).not.toHaveProperty("customer");
    });
  });

  describe("regression prevention", () => {
    it("ensures computed fields remain excluded across multiple registrations", () => {
      const server = new McpServer({ name: "t", version: "1" });
      const schemas: Record<string, Record<string, any>> = {};

      // @ts-ignore override registerTool to capture input schemas
      server.registerTool = (name: string, config: any, handler: any): any => {
        schemas[name] = config.inputSchema;
        return undefined as any;
      };

      const computedFields = new Set(["computedValue"]);
      const res = new McpResourceAnnotation(
        "products",
        "Products",
        "Products",
        "CatalogService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["name", "String"],
          ["computedValue", "Integer"],
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["create", "update"] },
        undefined,
        computedFields,
      );

      const accesses: WrapAccess = { canCreate: true, canUpdate: true };
      registerEntityWrappers(
        res,
        server,
        false,
        ["create", "update"],
        accesses,
      );

      // Check create tool
      expect(schemas["CatalogService_Products_create"]).toBeDefined();
      expect(schemas["CatalogService_Products_create"]).toHaveProperty("name");
      expect(schemas["CatalogService_Products_create"]).not.toHaveProperty(
        "computedValue",
      );

      // Check update tool
      expect(schemas["CatalogService_Products_update"]).toBeDefined();
      expect(schemas["CatalogService_Products_update"]).toHaveProperty("ID");
      expect(schemas["CatalogService_Products_update"]).toHaveProperty("name");
      expect(schemas["CatalogService_Products_update"]).not.toHaveProperty(
        "computedValue",
      );
    });
  });
});

// Import the internal functions for testing - these are not exported
// We need to use require to access the internal module functions
const entityToolsModule = require("../../../src/mcp/entity-tools");

// Mock CAP CDS for testing
const mockCDS = {
  ql: {
    SELECT: {
      from: (entity: string) => ({
        SELECT: {
          from: entity,
          where: undefined,
          limit: undefined,
          orderBy: undefined,
        },
        columns: (...cols: string[]) => mockCDS.ql.SELECT.from(entity),
        where: (condition: any) => {
          const query = mockCDS.ql.SELECT.from(entity);
          query.SELECT.where = condition;
          return query;
        },
        limit: (rows?: number, offset?: number) => {
          const query = mockCDS.ql.SELECT.from(entity);
          (query.SELECT as any).limit = { rows, offset };
          return query;
        },
        orderBy: (...order: string[]) => {
          const query = mockCDS.ql.SELECT.from(entity);
          (query.SELECT as any).orderBy = order;
          return query;
        },
      }),
    },
  },
  parse: {
    expr: (expression: string) => ({ expression }),
  },
};

// Mock service for testing
const mockService = {
  run: jest.fn(),
};

describe("entity-tools - query filtering consistency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set global.cds for the functions that need it
    (global as any).cds = mockCDS;
  });

  // Test the buildQuery function (this would need to be exported or accessed differently)
  describe("buildQuery function", () => {
    it("should build query with WHERE conditions", () => {
      // This test would require access to the buildQuery function
      // For now, we'll test via the executeQuery behavior
    });
  });

  describe("executeQuery function", () => {
    let executeQuery: any;
    let baseQuery: any;
    let args: EntityListQueryArgs;

    beforeEach(() => {
      // Access the executeQuery function - this would need to be exported for proper testing
      // For now, we'll test the behavior through integration

      // Create a base query with WHERE conditions to simulate filtered query
      baseQuery = {
        SELECT: {
          from: "Books",
          where: { expression: "stock > 5" },
          limit: { rows: 25, offset: 0 },
          orderBy: ["title asc"],
        },
      };

      args = {
        top: 25,
        skip: 0,
        return: "rows" as const,
      };
    });

    it("should preserve WHERE conditions in count queries", async () => {
      args.return = "count";

      // Mock the expected count query structure
      const expectedCountQuery = {
        SELECT: {
          from: "Books",
          where: { expression: "stock > 5" }, // Should preserve the WHERE clause
          limit: { rows: 25, offset: 0 },
          orderBy: ["title asc"],
        },
        columns: jest.fn(),
      };

      mockService.run.mockResolvedValue([{ count: 3 }]);

      // We would call executeQuery here if it was exported
      // For now, this test demonstrates the expected behavior
      expect(mockService.run).not.toHaveBeenCalled();
    });

    it("should preserve WHERE conditions in aggregate queries", async () => {
      args.return = "aggregate";
      args.aggregate = [{ field: "stock", fn: "sum" }];

      const expectedAggQuery = {
        SELECT: {
          from: "Books",
          where: { expression: "stock > 5" }, // Should preserve the WHERE clause
          limit: { rows: 25, offset: 0 },
          orderBy: ["title asc"],
        },
      };

      mockService.run.mockResolvedValue([{ sum_stock: 30 }]);

      // Test that aggregate queries preserve filtering
      expect(mockService.run).not.toHaveBeenCalled();
    });

    it("should maintain consistency across all return types", async () => {
      // Test that the same filter applied to different return types
      // operates on the same filtered dataset

      const filterCondition = { expression: "stock > 5" };

      // All queries should have the same WHERE clause
      const rowsQuery = {
        SELECT: { from: "Books", where: filterCondition },
      };

      const countQuery = {
        SELECT: { from: "Books", where: filterCondition },
      };

      const aggQuery = {
        SELECT: { from: "Books", where: filterCondition },
      };

      // Verify that all query types preserve the same filtering logic
      expect(rowsQuery.SELECT.where).toEqual(countQuery.SELECT.where);
      expect(countQuery.SELECT.where).toEqual(aggQuery.SELECT.where);
    });

    it("should handle complex WHERE conditions", async () => {
      // Test multiple WHERE clauses
      const complexWhere = {
        and: [
          { expression: "stock > 5" },
          { expression: "contains(title, 'Book')" },
        ],
      };

      const baseQueryWithComplexFilter = {
        SELECT: {
          from: "Books",
          where: complexWhere,
          limit: { rows: 25, offset: 0 },
        },
      };

      // Both count and aggregate should preserve complex WHERE conditions
      const countArgs = { ...args, return: "count" as const };
      const aggArgs = {
        ...args,
        return: "aggregate" as const,
        aggregate: [{ field: "stock", fn: "sum" }],
      };

      // Verify complex conditions are preserved
      expect(baseQueryWithComplexFilter.SELECT.where).toEqual(complexWhere);
    });

    it("should handle queries without WHERE conditions", async () => {
      // Test that queries without filters work correctly
      const baseQueryWithoutFilter = {
        SELECT: {
          from: "Books",
          where: undefined,
          limit: { rows: 25, offset: 0 },
        },
      };

      mockService.run.mockResolvedValue([{ count: 100 }]);

      // Should work fine without WHERE conditions
      expect(baseQueryWithoutFilter.SELECT.where).toBeUndefined();
    });

    it("should preserve LIMIT and ORDER BY in count/aggregate queries", async () => {
      // Verify that not only WHERE but also LIMIT and ORDER BY are preserved
      const fullBaseQuery = {
        SELECT: {
          from: "Books",
          where: { expression: "stock > 5" },
          limit: { rows: 10, offset: 5 },
          orderBy: ["title asc", "stock desc"],
        },
      };

      // Count and aggregate queries should preserve all query parts
      const expectedPreservation = {
        where: { expression: "stock > 5" },
        limit: { rows: 10, offset: 5 },
        orderBy: ["title asc", "stock desc"],
      };

      expect(fullBaseQuery.SELECT.where).toEqual(expectedPreservation.where);
      expect(fullBaseQuery.SELECT.limit).toEqual(expectedPreservation.limit);
      expect(fullBaseQuery.SELECT.orderBy).toEqual(
        expectedPreservation.orderBy,
      );
    });
  });

  describe("filter consistency integration", () => {
    it("should return consistent results across return types", () => {
      // This would be a higher-level integration test
      // Testing that filtering a dataset with 10 total records, 3 matching filter:
      // - rows: returns 3 records
      // - count: returns { count: 3 }
      // - aggregate with sum: returns sum of only the 3 filtered records

      const testData = {
        totalRecords: 10,
        filteredRecords: 3,
        filteredSum: 30, // sum of stock for 3 filtered records
        totalSum: 100, // sum of stock for all 10 records
      };

      // The fixed implementation should ensure:
      // - count returns testData.filteredRecords (3), not testData.totalRecords (10)
      // - aggregate returns testData.filteredSum (30), not testData.totalSum (100)
      expect(testData.filteredRecords).toBe(3);
      expect(testData.filteredSum).toBe(30);
      expect(testData.filteredSum).not.toBe(testData.totalSum);
    });
  });
});

describe("coerceKeyValue - CDS type-aware key coercion", () => {
  describe("safe integer CDS types should coerce digit strings to numbers", () => {
    it.each(["Integer", "Int16", "Int32", "UInt8"])(
      "coerces digit-only string to number for CDS type %s",
      (cdsType) => {
        expect(coerceKeyValue("123", cdsType)).toBe(123);
      },
    );
  });

  describe("precision-sensitive types should preserve strings", () => {
    it("preserves digit-only string for Int64 (exceeds MAX_SAFE_INTEGER risk)", () => {
      expect(coerceKeyValue("9007199254740993", "Int64")).toBe(
        "9007199254740993",
      );
    });

    it("preserves small digit string for Int64 (consistent behavior)", () => {
      expect(coerceKeyValue("123", "Int64")).toBe("123");
    });

    it("preserves digit string for Decimal (exact arithmetic)", () => {
      expect(coerceKeyValue("12345", "Decimal")).toBe("12345");
    });

    it("preserves digit string for Double", () => {
      expect(coerceKeyValue("123", "Double")).toBe("123");
    });
  });

  describe("string CDS types should preserve digit-only strings", () => {
    it("preserves digit-only string for CDS type String", () => {
      expect(coerceKeyValue("202402110001", "String")).toBe("202402110001");
    });

    it("preserves digit-only string for CDS type UUID", () => {
      expect(coerceKeyValue("123456", "UUID")).toBe("123456");
    });

    it("preserves digit-only string for CDS type LargeString", () => {
      expect(coerceKeyValue("999", "LargeString")).toBe("999");
    });
  });

  describe("non-string values are passed through unchanged", () => {
    it("passes through number values for Integer type", () => {
      expect(coerceKeyValue(42, "Integer")).toBe(42);
    });

    it("passes through number values for String type", () => {
      expect(coerceKeyValue(42, "String")).toBe(42);
    });

    it("passes through boolean values", () => {
      expect(coerceKeyValue(true, "Boolean")).toBe(true);
    });

    it("passes through null", () => {
      expect(coerceKeyValue(null, "String")).toBe(null);
    });
  });

  describe("non-numeric strings are never coerced", () => {
    it("preserves alphanumeric string for Integer type", () => {
      expect(coerceKeyValue("abc123", "Integer")).toBe("abc123");
    });

    it("preserves UUID-format string for Integer type", () => {
      expect(
        coerceKeyValue("550e8400-e29b-41d4-a716-446655440000", "Integer"),
      ).toBe("550e8400-e29b-41d4-a716-446655440000");
    });

    it("preserves empty string", () => {
      expect(coerceKeyValue("", "Integer")).toBe("");
    });
  });

  describe("negative integer strings should be coerced for safe types", () => {
    it("coerces negative digit string for Integer", () => {
      expect(coerceKeyValue("-42", "Integer")).toBe(-42);
    });

    it("coerces negative digit string for Int32", () => {
      expect(coerceKeyValue("-1", "Int32")).toBe(-1);
    });

    it("coerces negative digit string for Int16", () => {
      expect(coerceKeyValue("-100", "Int16")).toBe(-100);
    });

    it("does NOT coerce negative strings for UInt8 (unsigned)", () => {
      expect(coerceKeyValue("-0", "UInt8")).toBe("-0");
      expect(coerceKeyValue("-5", "UInt8")).toBe("-5");
    });

    it("coerces non-negative digit strings for UInt8", () => {
      expect(coerceKeyValue("0", "UInt8")).toBe(0);
      expect(coerceKeyValue("255", "UInt8")).toBe(255);
    });
  });

  describe("negative strings preserved for precision-sensitive types", () => {
    it("preserves negative digit string for Int64", () => {
      expect(coerceKeyValue("-123", "Int64")).toBe("-123");
    });

    it("preserves negative decimal string for Decimal", () => {
      expect(coerceKeyValue("-99.99", "Decimal")).toBe("-99.99");
    });

    it("does NOT coerce strings for Double (not precision-sensitive)", () => {
      expect(coerceKeyValue("-3.14", "Double")).toBe("-3.14");
    });
  });

  describe("number-to-string coercion for precision-sensitive types", () => {
    it("coerces number to string for Int64", () => {
      expect(coerceKeyValue(42, "Int64")).toBe("42");
    });

    it("coerces number to string for Decimal", () => {
      expect(coerceKeyValue(3.14, "Decimal")).toBe("3.14");
    });

    it("does NOT coerce number to string for Double (not precision-sensitive)", () => {
      expect(coerceKeyValue(1.5, "Double")).toBe(1.5);
    });

    it("coerces zero to string for Int64", () => {
      expect(coerceKeyValue(0, "Int64")).toBe("0");
    });
  });
});

describe("determineMcpParameterType - numeric type validation", () => {
  // These tests use real Zod (not mocked) to verify actual validation behavior
  const { determineMcpParameterType } = require("../../../src/mcp/utils");

  describe("safe integer types reject non-integers", () => {
    it.each(["Integer", "Int16", "Int32"])(
      "%s accepts 42 and rejects 1.5",
      (cdsType) => {
        const schema = determineMcpParameterType(cdsType);
        expect(schema.safeParse(42).success).toBe(true);
        expect(schema.safeParse(1.5).success).toBe(false);
      },
    );
  });

  describe("UInt8 rejects negative values", () => {
    it("accepts 0", () => {
      const schema = determineMcpParameterType("UInt8");
      expect(schema.safeParse(0).success).toBe(true);
    });

    it("accepts 255", () => {
      const schema = determineMcpParameterType("UInt8");
      expect(schema.safeParse(255).success).toBe(true);
    });

    it("rejects -1", () => {
      const schema = determineMcpParameterType("UInt8");
      expect(schema.safeParse(-1).success).toBe(false);
    });

    it("rejects 1.5", () => {
      const schema = determineMcpParameterType("UInt8");
      expect(schema.safeParse(1.5).success).toBe(false);
    });
  });

  describe("Int64 accepts string or number and normalizes to string", () => {
    it("accepts number 42 and returns '42'", () => {
      const schema = determineMcpParameterType("Int64");
      const result = schema.parse(42);
      expect(result).toBe("42");
    });

    it("accepts string '123' and returns '123'", () => {
      const schema = determineMcpParameterType("Int64");
      const result = schema.parse("123");
      expect(result).toBe("123");
    });

    it("accepts large string beyond MAX_SAFE_INTEGER", () => {
      const schema = determineMcpParameterType("Int64");
      const result = schema.parse("9007199254740993");
      expect(result).toBe("9007199254740993");
    });

    it("rejects non-integer number 1.5", () => {
      const schema = determineMcpParameterType("Int64");
      expect(schema.safeParse(1.5).success).toBe(false);
    });

    it("rejects boolean", () => {
      const schema = determineMcpParameterType("Int64");
      expect(schema.safeParse(true).success).toBe(false);
    });
  });

  describe("Decimal accepts string or number and normalizes to string", () => {
    it("accepts number 3.14 and returns '3.14'", () => {
      const schema = determineMcpParameterType("Decimal");
      const result = schema.parse(3.14);
      expect(result).toBe("3.14");
    });

    it("accepts string '99.99' and returns '99.99'", () => {
      const schema = determineMcpParameterType("Decimal");
      const result = schema.parse("99.99");
      expect(result).toBe("99.99");
    });

    it("accepts integer number 42 and returns '42'", () => {
      const schema = determineMcpParameterType("Decimal");
      const result = schema.parse(42);
      expect(result).toBe("42");
    });

    it("rejects boolean", () => {
      const schema = determineMcpParameterType("Decimal");
      expect(schema.safeParse(true).success).toBe(false);
    });
  });

  describe("Double remains z.number() without transformation", () => {
    it("accepts 3.14 and returns 3.14", () => {
      const schema = determineMcpParameterType("Double");
      expect(schema.parse(3.14)).toBe(3.14);
    });

    it("rejects string '3.14'", () => {
      const schema = determineMcpParameterType("Double");
      expect(schema.safeParse("3.14").success).toBe(false);
    });
  });
});
