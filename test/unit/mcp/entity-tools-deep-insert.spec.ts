import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEntityWrappers } from "../../../src/mcp/entity-tools";
import { McpResourceAnnotation } from "../../../src/annotations/structures";
import { WrapAccess } from "../../../src/auth/utils";

// Mock the buildDeepInsertZodType function
jest.mock("../../../src/mcp/utils", () => {
  const actual = jest.requireActual("../../../src/mcp/utils");
  return {
    ...actual,
    buildDeepInsertZodType: jest.fn((targetEntity) => ({
      _type: `deep-insert-array-for-${targetEntity}`,
      optional: () => ({
        _type: `optional-deep-insert-array-for-${targetEntity}`,
        describe: (desc: string) => ({
          _type: `described-optional-deep-insert-array-for-${targetEntity}`,
          description: desc,
        }),
      }),
      describe: (desc: string) => ({
        _type: `described-deep-insert-array-for-${targetEntity}`,
        description: desc,
      }),
    })),
  };
});

describe("entity-tools - deep insert support", () => {
  describe("create tool with deep insert associations", () => {
    it("includes deep insert associations in create input schema", () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedInputSchema: Record<string, any> = {};

      // @ts-ignore override registerTool to capture input schema
      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedInputSchema = config.inputSchema;
        return undefined as any;
      };

      const deepInsertRefs = new Map([
        ["items", "BookingService.BookingItem"],
        ["addresses", "CustomerService.Address"],
      ]);

      const res = new McpResourceAnnotation(
        "bookings",
        "Bookings",
        "Bookings",
        "BookingService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["customerName", "String"],
          ["items", "Association to BookingItems"], // Deep insert
          ["addresses", "Association to Addresses"], // Deep insert
          ["category", "Association to Categories"], // Regular association (no deep insert)
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["create"] },
        undefined,
        undefined,
        undefined,
        undefined,
        deepInsertRefs,
      );

      const accesses: WrapAccess = { canCreate: true };
      registerEntityWrappers(res, server, false, ["create"], accesses);

      // Regular fields should be present
      expect(capturedInputSchema).toHaveProperty("customerName");

      // Deep insert associations should be present
      expect(capturedInputSchema).toHaveProperty("items");
      expect(capturedInputSchema).toHaveProperty("addresses");

      // Regular associations should NOT be present (they're completely skipped)
      expect(capturedInputSchema).not.toHaveProperty("category");
    });

    it("excludes regular associations without deep insert", () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedInputSchema: Record<string, any> = {};

      // @ts-ignore override registerTool to capture input schema
      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedInputSchema = config.inputSchema;
        return undefined as any;
      };

      // No deep insert refs - all associations should be excluded
      const res = new McpResourceAnnotation(
        "orders",
        "Orders",
        "Orders",
        "SalesService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["orderDate", "Date"],
          ["customer", "Association to Customers"], // No deep insert
          ["items", "Association to OrderItems"], // No deep insert
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["create"] },
        undefined,
        undefined,
        undefined,
        undefined,
        new Map(), // Empty deep insert refs
      );

      const accesses: WrapAccess = { canCreate: true };
      registerEntityWrappers(res, server, false, ["create"], accesses);

      // Regular field should be present
      expect(capturedInputSchema).toHaveProperty("orderDate");

      // Associations should NOT be present
      expect(capturedInputSchema).not.toHaveProperty("customer");
      expect(capturedInputSchema).not.toHaveProperty("items");
    });

    it("handles mix of deep insert and regular associations", () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedInputSchema: Record<string, any> = {};

      // @ts-ignore override registerTool to capture input schema
      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedInputSchema = config.inputSchema;
        return undefined as any;
      };

      const deepInsertRefs = new Map([["items", "OrderService.OrderItem"]]);

      const res = new McpResourceAnnotation(
        "orders",
        "Orders",
        "Orders",
        "OrderService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["orderNumber", "String"],
          ["items", "Association to OrderItems"], // Deep insert
          ["customer", "Association to Customers"], // Regular association
          ["shippingAddress", "Association to Addresses"], // Regular association
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["create"] },
        undefined,
        undefined,
        undefined,
        undefined,
        deepInsertRefs,
      );

      const accesses: WrapAccess = { canCreate: true };
      registerEntityWrappers(res, server, false, ["create"], accesses);

      // Regular field should be present
      expect(capturedInputSchema).toHaveProperty("orderNumber");

      // Deep insert association should be present
      expect(capturedInputSchema).toHaveProperty("items");

      // Regular associations should NOT be present
      expect(capturedInputSchema).not.toHaveProperty("customer");
      expect(capturedInputSchema).not.toHaveProperty("shippingAddress");
    });

    it("handles entities with only deep insert associations", () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedInputSchema: Record<string, any> = {};

      // @ts-ignore override registerTool to capture input schema
      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedInputSchema = config.inputSchema;
        return undefined as any;
      };

      const deepInsertRefs = new Map([
        ["primaryItems", "Service.PrimaryItem"],
        ["secondaryItems", "Service.SecondaryItem"],
      ]);

      const res = new McpResourceAnnotation(
        "container",
        "Container",
        "Container",
        "Service",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["primaryItems", "Association to PrimaryItems"],
          ["secondaryItems", "Association to SecondaryItems"],
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["create"] },
        undefined,
        undefined,
        undefined,
        undefined,
        deepInsertRefs,
      );

      const accesses: WrapAccess = { canCreate: true };
      registerEntityWrappers(res, server, false, ["create"], accesses);

      // Both deep insert associations should be present
      expect(capturedInputSchema).toHaveProperty("primaryItems");
      expect(capturedInputSchema).toHaveProperty("secondaryItems");
    });
  });

  describe("update tool with deep insert associations", () => {
    it("includes deep insert associations in update input schema", () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedInputSchema: Record<string, any> = {};

      // @ts-ignore override registerTool to capture input schema
      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedInputSchema = config.inputSchema;
        return undefined as any;
      };

      const deepInsertRefs = new Map([["items", "BookingService.BookingItem"]]);

      const res = new McpResourceAnnotation(
        "bookings",
        "Bookings",
        "Bookings",
        "BookingService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["customerName", "String"],
          ["items", "Association to BookingItems"], // Deep insert
          ["status", "Association to BookingStatus"], // Regular association
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["update"] },
        undefined,
        undefined,
        undefined,
        undefined,
        deepInsertRefs,
      );

      const accesses: WrapAccess = { canUpdate: true };
      registerEntityWrappers(res, server, false, ["update"], accesses);

      // Key field should be present
      expect(capturedInputSchema).toHaveProperty("ID");

      // Regular fields should be present
      expect(capturedInputSchema).toHaveProperty("customerName");

      // Deep insert association should be present
      expect(capturedInputSchema).toHaveProperty("items");

      // Regular association should NOT be present
      expect(capturedInputSchema).not.toHaveProperty("status");
    });

    it("excludes computed fields but includes deep insert associations", () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedInputSchema: Record<string, any> = {};

      // @ts-ignore override registerTool to capture input schema
      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedInputSchema = config.inputSchema;
        return undefined as any;
      };

      const computedFields = new Set(["totalAmount"]);
      const deepInsertRefs = new Map([["items", "OrderService.OrderItem"]]);

      const res = new McpResourceAnnotation(
        "orders",
        "Orders",
        "Orders",
        "OrderService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["orderNumber", "String"],
          ["totalAmount", "Decimal"], // Computed
          ["items", "Association to OrderItems"], // Deep insert
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["update"] },
        undefined,
        computedFields,
        undefined,
        undefined,
        deepInsertRefs,
      );

      const accesses: WrapAccess = { canUpdate: true };
      registerEntityWrappers(res, server, false, ["update"], accesses);

      // Regular fields should be present
      expect(capturedInputSchema).toHaveProperty("ID");
      expect(capturedInputSchema).toHaveProperty("orderNumber");

      // Deep insert association should be present
      expect(capturedInputSchema).toHaveProperty("items");

      // Computed field should NOT be present
      expect(capturedInputSchema).not.toHaveProperty("totalAmount");
    });

    it("handles entities without deep insert in update", () => {
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
          ["category", "Association to Categories"],
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["update"] },
        undefined,
        undefined,
        undefined,
        undefined,
        new Map(), // Empty deep insert refs
      );

      const accesses: WrapAccess = { canUpdate: true };
      registerEntityWrappers(res, server, false, ["update"], accesses);

      // Regular fields should be present
      expect(capturedInputSchema).toHaveProperty("ID");
      expect(capturedInputSchema).toHaveProperty("name");

      // Association should NOT be present
      expect(capturedInputSchema).not.toHaveProperty("category");
    });
  });

  describe("deep insert with multiple operations", () => {
    it("maintains consistent deep insert schema across create and update", () => {
      const server = new McpServer({ name: "t", version: "1" });
      const schemas: Record<string, Record<string, any>> = {};

      // @ts-ignore override registerTool to capture input schemas
      server.registerTool = (name: string, config: any, handler: any): any => {
        schemas[name] = config.inputSchema;
        return undefined as any;
      };

      const deepInsertRefs = new Map([["items", "BookingService.BookingItem"]]);

      const res = new McpResourceAnnotation(
        "bookings",
        "Bookings",
        "Bookings",
        "BookingService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["customerName", "String"],
          ["items", "Association to BookingItems"], // Deep insert
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["create", "update"] },
        undefined,
        undefined,
        undefined,
        undefined,
        deepInsertRefs,
      );

      const accesses: WrapAccess = { canCreate: true, canUpdate: true };
      registerEntityWrappers(
        res,
        server,
        false,
        ["create", "update"],
        accesses,
      );

      // Both tools should have deep insert association
      expect(schemas["BookingService_Bookings_create"]).toHaveProperty("items");
      expect(schemas["BookingService_Bookings_update"]).toHaveProperty("items");

      // Both should have regular fields
      expect(schemas["BookingService_Bookings_create"]).toHaveProperty(
        "customerName",
      );
      expect(schemas["BookingService_Bookings_update"]).toHaveProperty(
        "customerName",
      );
    });
  });

  describe("deep insert edge cases", () => {
    it("handles empty deepInsertRefs gracefully", () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedInputSchema: Record<string, any> = {};

      // @ts-ignore override registerTool to capture input schema
      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedInputSchema = config.inputSchema;
        return undefined as any;
      };

      const res = new McpResourceAnnotation(
        "simple",
        "SimpleEntity",
        "SimpleEntity",
        "Service",
        new Set(["filter"]),
        new Map([
          ["ID", "Integer"],
          ["name", "String"],
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["create"] },
        undefined,
        undefined,
        undefined,
        undefined,
        new Map(), // Empty map
      );

      const accesses: WrapAccess = { canCreate: true };
      registerEntityWrappers(res, server, false, ["create"], accesses);

      // Should work normally with empty deep insert refs
      expect(capturedInputSchema).toHaveProperty("name");
    });

    it("handles undefined deepInsertRefs", () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedInputSchema: Record<string, any> = {};

      // @ts-ignore override registerTool to capture input schema
      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedInputSchema = config.inputSchema;
        return undefined as any;
      };

      const res = new McpResourceAnnotation(
        "simple",
        "SimpleEntity",
        "SimpleEntity",
        "Service",
        new Set(["filter"]),
        new Map([
          ["ID", "Integer"],
          ["name", "String"],
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["create"] },
      );
      // Note: deepInsertRefs not provided (will default to empty Map)

      const accesses: WrapAccess = { canCreate: true };
      registerEntityWrappers(res, server, false, ["create"], accesses);

      // Should work normally with undefined deep insert refs
      expect(capturedInputSchema).toHaveProperty("name");
    });
  });
});
