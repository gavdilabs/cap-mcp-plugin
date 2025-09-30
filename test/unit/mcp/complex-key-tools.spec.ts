import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEntityWrappers } from "../../../src/mcp/entity-tools";
import { McpResourceAnnotation } from "../../../src/annotations/structures";
import { WrapAccess } from "../../../src/auth/utils";

// Mock logger
jest.mock("../../../src/logger", () => ({
  LOGGER: {
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("Complex Key MCP Tools", () => {
  describe("registerEntityWrappers with complex key structures", () => {
    let server: McpServer;
    let registeredTools: string[];

    beforeEach(() => {
      server = new McpServer({ name: "test", version: "1.0.0" });
      registeredTools = [];

      // Mock registerTool to capture tool registrations
      // @ts-ignore override registerTool to capture registrations
      server.registerTool = (name: string, definition: any, handler: any) => {
        registeredTools.push(name);
        // return noop handler
        return undefined as any;
      };
    });

    test("should register tools for entity with multiple primitive keys", () => {
      const annotation = new McpResourceAnnotation(
        "MultiKeyEntity",
        "Multi Key Entity",
        "MultiKeyEntity",
        "TestService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "UUID"],
          ["random", "Integer"],
          ["description", "String"],
          ["createdAt", "DateTime"],
        ]),
        new Map([
          ["ID", "UUID"],
          ["random", "Integer"],
        ]),
        {
          tools: true,
          modes: ["query", "get", "create", "update", "delete"],
        },
      );

      const accesses: WrapAccess = {
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      };

      registerEntityWrappers(
        annotation,
        server,
        false,
        ["query", "get", "create", "update", "delete"],
        accesses,
      );

      expect(registeredTools).toEqual(
        expect.arrayContaining([
          "TestService_MultiKeyEntity_query",
          "TestService_MultiKeyEntity_get",
          "TestService_MultiKeyEntity_create",
          "TestService_MultiKeyEntity_update",
          "TestService_MultiKeyEntity_delete",
        ]),
      );
    });

    test("should register tools for entity with association keys", () => {
      const annotation = new McpResourceAnnotation(
        "EntityWithAssociationKey",
        "Entity With Association Key",
        "EntityWithAssociationKey",
        "TestService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "UUID"],
          ["other", "UUID"], // Association key resolved to UUID type
          ["description", "String"],
        ]),
        new Map([
          ["ID", "UUID"],
          ["other", "UUID"], // Association key in resourceKeys
        ]),
        {
          tools: true,
          modes: ["get", "update", "delete"],
        },
      );

      const accesses: WrapAccess = {
        canRead: true,
        canCreate: false,
        canUpdate: true,
        canDelete: true,
      };

      registerEntityWrappers(
        annotation,
        server,
        false,
        ["get", "update", "delete"],
        accesses,
      );

      expect(registeredTools).toEqual(
        expect.arrayContaining([
          "TestService_EntityWithAssociationKey_get",
          "TestService_EntityWithAssociationKey_update",
          "TestService_EntityWithAssociationKey_delete",
        ]),
      );

      // Should not register query or create tools
      expect(registeredTools).not.toEqual(
        expect.arrayContaining([
          "TestService_EntityWithAssociationKey_query",
          "TestService_EntityWithAssociationKey_create",
        ]),
      );
    });

    test("should register tools for entity with mixed key types", () => {
      const annotation = new McpResourceAnnotation(
        "ComplexKeyEntity",
        "test case 1",
        "ComplexKeyEntity",
        "AnMCPTestService1",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "UUID"],
          ["random", "Integer"],
          ["other", "UUID"], // Association key resolved to UUID type
          ["date", "Date"],
        ]),
        new Map([
          ["ID", "UUID"],
          ["random", "Integer"],
          ["other", "UUID"], // All three are keys
        ]),
        {
          tools: true,
          modes: ["query", "get", "create", "update"],
        },
      );

      const accesses: WrapAccess = {
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: false,
      };

      registerEntityWrappers(
        annotation,
        server,
        false,
        ["query", "get", "create", "update"],
        accesses,
      );

      expect(registeredTools).toEqual(
        expect.arrayContaining([
          "AnMCPTestService1_ComplexKeyEntity_query",
          "AnMCPTestService1_ComplexKeyEntity_get",
          "AnMCPTestService1_ComplexKeyEntity_create",
          "AnMCPTestService1_ComplexKeyEntity_update",
        ]),
      );

      // Should not register delete tool
      expect(registeredTools).not.toEqual(
        expect.arrayContaining(["AnMCPTestService1_ComplexKeyEntity_delete"]),
      );
    });

    test("should respect entity-level modes for complex key entity", () => {
      const annotation = new McpResourceAnnotation(
        "PartialModeEntity",
        "Partial Mode Entity",
        "PartialModeEntity",
        "TestService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "UUID"],
          ["random", "Integer"],
          ["other", "UUID"],
          ["description", "String"],
        ]),
        new Map([
          ["ID", "UUID"],
          ["random", "Integer"],
          ["other", "UUID"],
        ]),
        {
          tools: true,
          modes: ["get", "delete"], // Only get and delete
        },
      );

      const accesses: WrapAccess = {
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      };

      registerEntityWrappers(
        annotation,
        server,
        false,
        ["query", "get", "create", "update", "delete"], // Global modes
        accesses,
      );

      expect(registeredTools).toEqual(
        expect.arrayContaining([
          "TestService_PartialModeEntity_get",
          "TestService_PartialModeEntity_delete",
        ]),
      );

      // Should not register tools not in entity modes
      expect(registeredTools).not.toEqual(
        expect.arrayContaining([
          "TestService_PartialModeEntity_query",
          "TestService_PartialModeEntity_create",
          "TestService_PartialModeEntity_update",
        ]),
      );
    });

    test("should register tools using default modes when no wrap configuration", () => {
      const annotation = new McpResourceAnnotation(
        "SimpleEntity",
        "Simple Entity",
        "SimpleEntity",
        "TestService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "UUID"],
          ["name", "String"],
        ]),
        new Map([["ID", "UUID"]]),
        undefined, // No wrap configuration
      );

      const accesses: WrapAccess = {
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      };

      registerEntityWrappers(
        annotation,
        server,
        false,
        ["query", "get", "create", "update", "delete"],
        accesses,
      );

      // Should register tools using default modes when no wrap configuration
      expect(registeredTools).toEqual(
        expect.arrayContaining([
          "TestService_SimpleEntity_query",
          "TestService_SimpleEntity_get",
          "TestService_SimpleEntity_create",
          "TestService_SimpleEntity_update",
          "TestService_SimpleEntity_delete",
        ]),
      );
    });

    test("should register tools based on wrap modes even when tools config exists", () => {
      const annotation = new McpResourceAnnotation(
        "EntityWithLimitedModes",
        "Entity With Limited Modes",
        "EntityWithLimitedModes",
        "TestService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "UUID"],
          ["name", "String"],
        ]),
        new Map([["ID", "UUID"]]),
        {
          tools: false, // Note: registerEntityWrappers doesn't check this flag
          modes: ["query", "get"],
        },
      );

      const accesses: WrapAccess = {
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      };

      registerEntityWrappers(
        annotation,
        server,
        false,
        ["query", "get"],
        accesses,
      );

      // registerEntityWrappers ignores the tools flag and registers based on modes
      expect(registeredTools).toEqual(
        expect.arrayContaining([
          "TestService_EntityWithLimitedModes_query",
          "TestService_EntityWithLimitedModes_get",
        ]),
      );

      // Should not register create/update/delete as they're not in modes
      expect(registeredTools).not.toEqual(
        expect.arrayContaining([
          "TestService_EntityWithLimitedModes_create",
          "TestService_EntityWithLimitedModes_update",
          "TestService_EntityWithLimitedModes_delete",
        ]),
      );
    });

    test("should respect access permissions for complex key entity", () => {
      const annotation = new McpResourceAnnotation(
        "RestrictedEntity",
        "Restricted Entity",
        "RestrictedEntity",
        "TestService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "UUID"],
          ["random", "Integer"],
          ["other", "UUID"],
        ]),
        new Map([
          ["ID", "UUID"],
          ["random", "Integer"],
          ["other", "UUID"],
        ]),
        {
          tools: true,
          modes: ["query", "get", "create", "update", "delete"],
        },
      );

      const accesses: WrapAccess = {
        canRead: true,
        canCreate: false, // No create permission
        canUpdate: false, // No update permission
        canDelete: false, // No delete permission
      };

      registerEntityWrappers(
        annotation,
        server,
        false,
        ["query", "get", "create", "update", "delete"],
        accesses,
      );

      // Should only register read operations
      expect(registeredTools).toEqual(
        expect.arrayContaining([
          "TestService_RestrictedEntity_query",
          "TestService_RestrictedEntity_get",
        ]),
      );

      // Should not register write operations
      expect(registeredTools).not.toEqual(
        expect.arrayContaining([
          "TestService_RestrictedEntity_create",
          "TestService_RestrictedEntity_update",
          "TestService_RestrictedEntity_delete",
        ]),
      );
    });

    test("should handle composition relationships correctly", () => {
      const invoicesAnnotation = new McpResourceAnnotation(
        "Invoices",
        "test case 1",
        "Invoices",
        "AnMCPTestService1",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "UUID"],
          ["random", "Integer"],
          ["other", "UUID"],
          ["date", "Date"],
        ]),
        new Map([
          ["ID", "UUID"],
          ["random", "Integer"],
          ["other", "UUID"],
        ]),
        {
          tools: true,
          modes: ["query", "get", "create", "update"],
        },
      );

      const linesAnnotation = new McpResourceAnnotation(
        "InvoiceLines",
        "test case 2",
        "InvoiceLines",
        "AnMCPTestService1",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "UUID"],
          ["toInvoice", "UUID"], // Association to Invoices
          ["product", "String"],
          ["quantity", "Integer"],
        ]),
        new Map([["ID", "UUID"]]), // Simple key
        {
          tools: true,
          modes: ["query", "get", "create", "update"],
        },
      );

      const accesses: WrapAccess = {
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      };

      // Register both entities
      registerEntityWrappers(
        invoicesAnnotation,
        server,
        false,
        ["query", "get", "create", "update"],
        accesses,
      );

      registerEntityWrappers(
        linesAnnotation,
        server,
        false,
        ["query", "get", "create", "update"],
        accesses,
      );

      // Should register tools for both entities
      expect(registeredTools).toEqual(
        expect.arrayContaining([
          "AnMCPTestService1_Invoices_query",
          "AnMCPTestService1_Invoices_get",
          "AnMCPTestService1_Invoices_create",
          "AnMCPTestService1_Invoices_update",
          "AnMCPTestService1_InvoiceLines_query",
          "AnMCPTestService1_InvoiceLines_get",
          "AnMCPTestService1_InvoiceLines_create",
          "AnMCPTestService1_InvoiceLines_update",
        ]),
      );
    });
  });
});
