import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEntityWrappers } from "../../../src/mcp/entity-tools";
import { McpResourceAnnotation } from "../../../src/annotations/structures";
import { WrapAccess } from "../../../src/auth/utils";

describe("entity-tools - @mcp.omit field handling in create/update responses", () => {
  // Setup global mocks for CDS
  const mockCDS = {
    ql: {
      INSERT: {
        into: jest.fn(() => ({
          entries: jest.fn(() => Promise.resolve()),
        })),
      },
      UPDATE: jest.fn(() => ({
        set: jest.fn(() => ({
          where: jest.fn(() => Promise.resolve()),
        })),
      })),
    },
    services: {} as any,
  };

  beforeEach(() => {
    (global as any).cds = mockCDS;
    jest.clearAllMocks();
    mockCDS.services = {};
  });

  describe("create tool with omitted fields", () => {
    it("should omit single field from create response", async () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedHandler: any;

      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedHandler = handler;
        return undefined as any;
      };

      const omittedFields = new Set(["secretMessage"]);
      const res = new McpResourceAnnotation(
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
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["create"] },
        undefined,
        undefined,
        undefined,
        omittedFields,
      );

      const mockResponse = {
        ID: 1,
        title: "Test Book",
        author: "Test Author",
        secretMessage: "This should be hidden",
      };

      const mockTx = {
        run: jest.fn().mockResolvedValue(mockResponse),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
      };

      mockCDS.services["CatalogService"] = {
        tx: jest.fn(() => mockTx),
      };

      const accesses: WrapAccess = { canCreate: true };
      registerEntityWrappers(res, server, false, ["create"], accesses);

      const result = await capturedHandler({
        title: "Test Book",
        author: "Test Author",
      });
      const parsedResponse = JSON.parse(result.content[0].text);

      expect(parsedResponse).toHaveProperty("ID", 1);
      expect(parsedResponse).toHaveProperty("title", "Test Book");
      expect(parsedResponse).toHaveProperty("author", "Test Author");
      expect(parsedResponse).not.toHaveProperty("secretMessage");
    });

    it("should omit multiple fields from create response", async () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedHandler: any;

      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedHandler = handler;
        return undefined as any;
      };

      const omittedFields = new Set(["password", "ssn", "internalId"]);
      const res = new McpResourceAnnotation(
        "users",
        "Users",
        "Users",
        "UserService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["name", "String"],
          ["email", "String"],
          ["password", "String"],
          ["ssn", "String"],
          ["internalId", "Integer"],
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["create"] },
        undefined,
        undefined,
        undefined,
        omittedFields,
      );

      const mockResponse = {
        ID: 1,
        name: "John Doe",
        email: "john@example.com",
        password: "secret123",
        ssn: "123-45-6789",
        internalId: 9999,
      };

      const mockTx = {
        run: jest.fn().mockResolvedValue(mockResponse),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
      };

      mockCDS.services["UserService"] = {
        tx: jest.fn(() => mockTx),
      };

      const accesses: WrapAccess = { canCreate: true };
      registerEntityWrappers(res, server, false, ["create"], accesses);

      const result = await capturedHandler({
        name: "John Doe",
        email: "john@example.com",
      });
      const parsedResponse = JSON.parse(result.content[0].text);

      expect(parsedResponse).toHaveProperty("ID", 1);
      expect(parsedResponse).toHaveProperty("name", "John Doe");
      expect(parsedResponse).toHaveProperty("email", "john@example.com");
      expect(parsedResponse).not.toHaveProperty("password");
      expect(parsedResponse).not.toHaveProperty("ssn");
      expect(parsedResponse).not.toHaveProperty("internalId");
    });

    it("should work correctly when no fields are omitted", async () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedHandler: any;

      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedHandler = handler;
        return undefined as any;
      };

      const res = new McpResourceAnnotation(
        "items",
        "Items",
        "Items",
        "ItemService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["name", "String"],
          ["value", "Decimal"],
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["create"] },
        undefined,
        undefined,
        undefined, // No omitted fields
      );

      const mockResponse = {
        ID: 1,
        name: "Item One",
        value: 100.5,
      };

      const mockTx = {
        run: jest.fn().mockResolvedValue(mockResponse),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
      };

      mockCDS.services["ItemService"] = {
        tx: jest.fn(() => mockTx),
      };

      const accesses: WrapAccess = { canCreate: true };
      registerEntityWrappers(res, server, false, ["create"], accesses);

      const result = await capturedHandler({ name: "Item One", value: 100.5 });
      const parsedResponse = JSON.parse(result.content[0].text);

      // All fields should be present
      expect(parsedResponse).toHaveProperty("ID", 1);
      expect(parsedResponse).toHaveProperty("name", "Item One");
      expect(parsedResponse).toHaveProperty("value", 100.5);
    });
  });

  describe("update tool with omitted fields", () => {
    it("should omit single field from update response", async () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedHandler: any;

      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedHandler = handler;
        return undefined as any;
      };

      const omittedFields = new Set(["secretMessage"]);
      const res = new McpResourceAnnotation(
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
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["update"] },
        undefined,
        undefined,
        undefined,
        omittedFields,
      );

      const mockResponse = {
        ID: 1,
        title: "Updated Book",
        author: "Updated Author",
        secretMessage: "Still hidden",
      };

      const mockTx = {
        run: jest.fn().mockResolvedValue(mockResponse),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
      };

      mockCDS.services["CatalogService"] = {
        tx: jest.fn(() => mockTx),
      };

      const accesses: WrapAccess = { canUpdate: true };
      registerEntityWrappers(res, server, false, ["update"], accesses);

      const result = await capturedHandler({
        ID: 1,
        title: "Updated Book",
        author: "Updated Author",
      });
      const parsedResponse = JSON.parse(result.content[0].text);

      expect(parsedResponse).toHaveProperty("ID", 1);
      expect(parsedResponse).toHaveProperty("title", "Updated Book");
      expect(parsedResponse).toHaveProperty("author", "Updated Author");
      expect(parsedResponse).not.toHaveProperty("secretMessage");
    });

    it("should omit multiple fields from update response", async () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedHandler: any;

      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedHandler = handler;
        return undefined as any;
      };

      const omittedFields = new Set(["password", "resetToken", "lastLoginIp"]);
      const res = new McpResourceAnnotation(
        "users",
        "Users",
        "Users",
        "UserService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["name", "String"],
          ["email", "String"],
          ["password", "String"],
          ["resetToken", "String"],
          ["lastLoginIp", "String"],
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["update"] },
        undefined,
        undefined,
        undefined,
        omittedFields,
      );

      const mockResponse = {
        ID: 1,
        name: "John Updated",
        email: "john.updated@example.com",
        password: "newpassword",
        resetToken: "token123",
        lastLoginIp: "192.168.1.1",
      };

      const mockTx = {
        run: jest.fn().mockResolvedValue(mockResponse),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
      };

      mockCDS.services["UserService"] = {
        tx: jest.fn(() => mockTx),
      };

      const accesses: WrapAccess = { canUpdate: true };
      registerEntityWrappers(res, server, false, ["update"], accesses);

      const result = await capturedHandler({
        ID: 1,
        name: "John Updated",
        email: "john.updated@example.com",
      });
      const parsedResponse = JSON.parse(result.content[0].text);

      expect(parsedResponse).toHaveProperty("ID", 1);
      expect(parsedResponse).toHaveProperty("name", "John Updated");
      expect(parsedResponse).toHaveProperty(
        "email",
        "john.updated@example.com",
      );
      expect(parsedResponse).not.toHaveProperty("password");
      expect(parsedResponse).not.toHaveProperty("resetToken");
      expect(parsedResponse).not.toHaveProperty("lastLoginIp");
    });

    it("should work correctly when no fields are omitted in update", async () => {
      const server = new McpServer({ name: "t", version: "1" });
      let capturedHandler: any;

      server.registerTool = (name: string, config: any, handler: any): any => {
        capturedHandler = handler;
        return undefined as any;
      };

      const res = new McpResourceAnnotation(
        "products",
        "Products",
        "Products",
        "ProductService",
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
        undefined,
        undefined, // No omitted fields
      );

      const mockResponse = {
        ID: 1,
        name: "Updated Product",
        price: 29.99,
      };

      const mockTx = {
        run: jest.fn().mockResolvedValue(mockResponse),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
      };

      mockCDS.services["ProductService"] = {
        tx: jest.fn(() => mockTx),
      };

      const accesses: WrapAccess = { canUpdate: true };
      registerEntityWrappers(res, server, false, ["update"], accesses);

      const result = await capturedHandler({
        ID: 1,
        name: "Updated Product",
        price: 29.99,
      });
      const parsedResponse = JSON.parse(result.content[0].text);

      // All fields should be present
      expect(parsedResponse).toHaveProperty("ID", 1);
      expect(parsedResponse).toHaveProperty("name", "Updated Product");
      expect(parsedResponse).toHaveProperty("price", 29.99);
    });
  });

  describe("omitted fields across create and update", () => {
    it("should apply omission consistently across create and update", async () => {
      const server = new McpServer({ name: "t", version: "1" });
      const handlers: Record<string, any> = {};

      server.registerTool = (name: string, config: any, handler: any): any => {
        handlers[name] = handler;
        return undefined as any;
      };

      const omittedFields = new Set(["secretField"]);
      const res = new McpResourceAnnotation(
        "data",
        "Data",
        "Data",
        "DataService",
        new Set(["filter", "orderby", "select", "top", "skip"]),
        new Map([
          ["ID", "Integer"],
          ["value", "String"],
          ["secretField", "String"],
        ]),
        new Map([["ID", "Integer"]]),
        new Map(),
        { tools: true, modes: ["create", "update"] },
        undefined,
        undefined,
        undefined,
        omittedFields,
      );

      const createResponse = {
        ID: 1,
        value: "Created",
        secretField: "Should be hidden",
      };

      const updateResponse = {
        ID: 1,
        value: "Updated",
        secretField: "Still hidden",
      };

      const createTx = {
        run: jest.fn().mockResolvedValue(createResponse),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
      };

      const updateTx = {
        run: jest.fn().mockResolvedValue(updateResponse),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
      };

      let callCount = 0;
      mockCDS.services["DataService"] = {
        tx: jest.fn(() => {
          callCount++;
          return callCount === 1 ? createTx : updateTx;
        }),
      };

      const accesses: WrapAccess = { canCreate: true, canUpdate: true };
      registerEntityWrappers(
        res,
        server,
        false,
        ["create", "update"],
        accesses,
      );

      // Test create
      const createResult = await handlers["DataService_Data_create"]({
        value: "Created",
      });
      const createParsed = JSON.parse(createResult.content[0].text);

      expect(createParsed).toHaveProperty("ID", 1);
      expect(createParsed).toHaveProperty("value", "Created");
      expect(createParsed).not.toHaveProperty("secretField");

      // Test update
      const updateResult = await handlers["DataService_Data_update"]({
        ID: 1,
        value: "Updated",
      });
      const updateParsed = JSON.parse(updateResult.content[0].text);

      expect(updateParsed).toHaveProperty("ID", 1);
      expect(updateParsed).toHaveProperty("value", "Updated");
      expect(updateParsed).not.toHaveProperty("secretField");
    });
  });
});
