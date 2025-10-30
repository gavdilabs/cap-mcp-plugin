import sinon from "sinon";
import cds from "@sap/cds";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CustomResourceTemplate } from "../../../src/mcp/custom-resource-template";
import { assignResourceToServer } from "../../../src/mcp/resources";
import { McpResourceAnnotation } from "../../../src/annotations/structures";
import * as utils from "../../../src/mcp/utils";

// Mock the logger
jest.mock("../../../src/logger", () => ({
  LOGGER: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock the validation module
jest.mock("../../../src/mcp/validation", () => ({
  ODataQueryValidator: jest.fn().mockImplementation(() => ({
    validateTop: jest.fn((value) => parseInt(value)),
    validateSkip: jest.fn((value) => parseInt(value)),
    validateSelect: jest.fn((value) => decodeURIComponent(value).split(",")),
    validateOrderBy: jest.fn((value) => decodeURIComponent(value)),
    validateFilter: jest.fn((value) => "decoded filter"),
  })),
  ODataValidationError: jest.fn(),
}));

// Mock CDS module completely
jest.mock("@sap/cds", () => ({
  test: jest.fn().mockResolvedValue(undefined),
  services: {},
  parse: {
    expr: jest.fn(),
  },
  connect: {
    to: jest.fn(),
  },
  User: {
    privileged: { id: "privileged", name: "Privileged User" },
    anonymous: { id: "anonymous", _is_anonymous: true },
  },
  context: {
    user: null,
  },
}));

jest.mock("../../../src/logger", () => ({
  LOGGER: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock SELECT builder
const mockQuery = {
  limit: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  columns: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
};

const SELECT = {
  from: jest.fn().mockReturnValue(mockQuery),
};

// Setup global SELECT
(global as any).SELECT = SELECT;

describe("MCP Resources", () => {
  let mockServer: sinon.SinonStubbedInstance<McpServer>;
  let loggerDebugStub: sinon.SinonStub;
  let loggerErrorStub: sinon.SinonStub;
  let writeODataDescriptionStub: sinon.SinonStub;

  beforeEach(async () => {
    // Initialize CDS test environment
    await cds.test("./");

    // Clear services
    (cds as any).services = {};

    // Setup stubs
    mockServer = sinon.createStubInstance(McpServer);

    writeODataDescriptionStub = sinon.stub(
      utils,
      "writeODataDescriptionForResource",
    );

    // Reset mocks
    (cds.parse.expr as jest.Mock).mockClear();
    SELECT.from.mockClear();
    mockQuery.limit.mockClear();
    mockQuery.where.mockClear();
    mockQuery.columns.mockClear();
    mockQuery.orderBy.mockClear();
  });

  afterEach(() => {
    sinon.restore();
    jest.clearAllMocks();
  });

  describe("assignResourceToServer", () => {
    describe("Static Resource Registration", () => {
      it("should register static resource when no functionalities", async () => {
        // Arrange
        const model = new McpResourceAnnotation(
          "TestResource",
          "Test description",
          "TestEntity",
          "TestService",
          new Set(),
          new Map(),
          new Map(),
          new Map(),
        );

        const mockService = {
          run: jest.fn().mockResolvedValue([{ id: 1, name: "test" }]),
          tx: jest.fn().mockReturnValue({
            run: jest.fn().mockResolvedValue([{ id: 1, name: "test" }]),
          }),
        };
        (cds as any).services["TestService"] = mockService;

        // Act
        assignResourceToServer(model, mockServer as any, false);

        // Assert

        sinon.assert.called(mockServer.registerResource);
        expect(mockServer.registerResource.getCalls()[0].args).toEqual([
          "TestResource",
          "odata://TestService/TestResource",
          { title: "TestEntity", description: "Test description" },
          expect.any(Function),
        ]);

        const registerCall = mockServer.registerResource.getCall(0);
        const handler = registerCall.args[3] as any;
        const mockUri = new URL("http://test.com");
        const queryParams = { top: "10", skip: "5" };

        const result = await handler(mockUri, queryParams);

        expect(SELECT.from).toHaveBeenCalledWith("TestEntity");
        expect(mockQuery.limit).toHaveBeenCalledWith(10);
        expect(mockService.tx).toHaveBeenCalledWith({
          user: { id: "privileged", name: "Privileged User" },
        });
        expect(mockService.tx().run).toHaveBeenCalledWith(mockQuery);
        expect(result.contents[0].text).toBe('[{"id":1,"name":"test"}]');
      });

      it("should handle service run failure in static resource", async () => {
        // Arrange
        const model = new McpResourceAnnotation(
          "TestResource",
          "Test description",
          "TestEntity",
          "TestService",
          new Set(),
          new Map(),
          new Map(),
          new Map(),
        );

        const mockService = {
          run: jest.fn().mockRejectedValue(new Error("Database error")),
        };
        (cds as any).services["TestService"] = mockService;

        assignResourceToServer(model, mockServer as any, false);
        const handler = mockServer.registerResource.getCall(0).args[3] as any;

        // Act
        const result = await handler(new URL("http://test.com"), {});

        // Assert
        expect(result.contents[0].text).toBe(
          "ERROR: Failed to find data due to unexpected error",
        );
      });

      it("should handle empty response in static resource", async () => {
        // Arrange
        const model = new McpResourceAnnotation(
          "TestResource",
          "Test description",
          "TestEntity",
          "TestService",
          new Set(),
          new Map(),
          new Map(),
          new Map(),
        );

        const mockService = {
          run: jest.fn().mockResolvedValue(null),
          tx: jest.fn().mockReturnValue({
            run: jest.fn().mockResolvedValue(null),
          }),
        };
        (cds as any).services["TestService"] = mockService;

        assignResourceToServer(model, mockServer as any, false);
        const handler = mockServer.registerResource.getCall(0).args[3] as any;

        // Act
        const result = await handler(new URL("http://test.com"), {});

        // Assert
        expect(result.contents[0].text).toBe("");
      });

      it("should use default limits when query params not provided", async () => {
        // Arrange
        const model = new McpResourceAnnotation(
          "TestResource",
          "Test description",
          "TestEntity",
          "TestService",
          new Set(),
          new Map(),
          new Map(),
          new Map(),
        );

        const mockService = {
          run: jest.fn().mockResolvedValue([]),
          tx: jest.fn().mockReturnValue({
            run: jest.fn().mockResolvedValue([]),
          }),
        };
        (cds as any).services["TestService"] = mockService;

        assignResourceToServer(model, mockServer as any, false);
        const handler = mockServer.registerResource.getCall(0).args[3] as any;

        // Act
        await handler(new URL("http://test.com"), {});

        // Assert
        expect(mockQuery.limit).toHaveBeenCalledWith(100);
      });
    });

    describe("Dynamic Resource Registration", () => {
      it("should register dynamic resource with functionalities", () => {
        // Arrange
        const model = new McpResourceAnnotation(
          "DynamicResource",
          "Test description",
          "TestEntity",
          "TestService",
          new Set(["filter", "select", "orderby"]),
          new Map(),
          new Map(),
          new Map(),
        );

        writeODataDescriptionStub.returns("Detailed OData description");

        // Act
        assignResourceToServer(model, mockServer as any, false);

        // Assert
        sinon.assert.calledWithMatch(writeODataDescriptionStub, model);
        sinon.assert.called(mockServer.registerResource);
        expect(mockServer.registerResource.getCalls()[0].args).toEqual([
          "DynamicResource",
          expect.any(CustomResourceTemplate),
          {
            title: "TestEntity",
            description: "Detailed OData description",
          },
          expect.any(Function),
        ]);

        // Verify ResourceTemplate URI construction
        const registerCall = mockServer.registerResource.getCall(0);
        const resourceTemplate = registerCall
          .args[1] as unknown as CustomResourceTemplate;
        expect(resourceTemplate).toBeInstanceOf(CustomResourceTemplate);

        // Verify the URI template format is grouped parameters
        expect(resourceTemplate.uriTemplate.toString()).toBe(
          "odata://TestService/DynamicResource{?filter,select,orderby}",
        );
        expect(resourceTemplate.uriTemplate.toString()).not.toContain("}{?");
      });

      it("should handle all query parameters correctly", async () => {
        // Arrange
        const model = new McpResourceAnnotation(
          "DynamicResource",
          "Test description",
          "TestEntity",
          "TestService",
          new Set(["filter", "select", "orderby"]),
          new Map(),
          new Map(),
          new Map(),
        );

        const mockService = {
          run: jest.fn().mockResolvedValue([]),
          tx: jest.fn().mockReturnValue({
            run: jest.fn().mockResolvedValue([]),
          }),
        };
        (cds as any).services["TestService"] = mockService;

        (cds.parse.expr as jest.Mock).mockReturnValue("parsed expression");

        assignResourceToServer(model, mockServer as any, false);
        const handler = mockServer.registerResource.getCall(0).args[3] as any;

        const queryParams = {
          top: "20",
          skip: "10",
          filter: "name%20eq%20test",
          select: "id%2Cname",
          orderby: "name%20asc",
          ignoredParam: "ignored",
        };

        // Act
        await handler(new URL("http://test.com"), queryParams);

        // Assert
        expect(SELECT.from).toHaveBeenCalledWith("TestEntity");
        expect(mockQuery.limit).toHaveBeenCalledWith(20, 10);
        expect(cds.parse.expr).toHaveBeenCalledWith("decoded filter");
        expect(mockQuery.where).toHaveBeenCalledWith("parsed expression");
        expect(mockQuery.columns).toHaveBeenCalledWith(["id", "name"]);
        expect(mockQuery.orderBy).toHaveBeenCalledWith("name asc");
      });

      it("should handle missing service error", async () => {
        // Arrange
        const model = new McpResourceAnnotation(
          "DynamicResource",
          "Test description",
          "TestEntity",
          "NonExistentService",
          new Set(["filter"]),
          new Map(),
          new Map(),
          new Map(),
        );

        // No service added to cds.services

        assignResourceToServer(model, mockServer as any, false);
        const handler = mockServer.registerResource.getCall(0).args[3] as any;

        // Act & Assert
        await expect(handler(new URL("http://test.com"), {})).rejects.toThrow(
          "Invalid service found for service 'NonExistentService'",
        );
      });

      it("should handle service run failure in dynamic resource", async () => {
        // Arrange
        const model = new McpResourceAnnotation(
          "DynamicResource",
          "Test description",
          "TestEntity",
          "TestService",
          new Set(["filter"]),
          new Map(),
          new Map(),
          new Map(),
        );

        const mockService = {
          run: jest.fn().mockRejectedValue(new Error("Service error")),
        };
        (cds as any).services["TestService"] = mockService;

        assignResourceToServer(model, mockServer as any, false);
        const handler = mockServer.registerResource.getCall(0).args[3] as any;

        // Act
        const result = await handler(new URL("http://test.com"), {});

        // Assert
        expect(result.contents[0].text).toBe(
          "ERROR: Failed to find data due to unexpected error",
        );
      });

      it("should handle default query limits in dynamic resource", async () => {
        // Arrange
        const model = new McpResourceAnnotation(
          "DynamicResource",
          "Test description",
          "TestEntity",
          "TestService",
          new Set(["filter"]),
          new Map(),
          new Map(),
          new Map(),
        );

        const mockService = {
          run: jest.fn().mockResolvedValue([]),
          tx: jest.fn().mockReturnValue({
            run: jest.fn().mockResolvedValue([]),
          }),
        };
        (cds as any).services["TestService"] = mockService;

        assignResourceToServer(model, mockServer as any, false);
        const handler = mockServer.registerResource.getCall(0).args[3] as any;

        // Act
        await handler(new URL("http://test.com"), {});

        // Assert
        expect(mockQuery.limit).toHaveBeenCalledWith(100, undefined);
      });
    });

    describe("Edge Cases", () => {
      it("should handle empty functionalities set as static resource", () => {
        // Arrange
        const model = new McpResourceAnnotation(
          "TestResource",
          "Test description",
          "TestEntity",
          "TestService",
          new Set(),
          new Map(),
          new Map(),
          new Map(),
        );

        // Act
        assignResourceToServer(model, mockServer as any, false);

        // Assert - Should register as static resource
        sinon.assert.called(mockServer.registerResource);
        const registerCall = mockServer.registerResource.getCall(0);
        expect(typeof registerCall.args[1]).toBe("string"); // Static URI, not ResourceTemplate
        expect(registerCall.args[1]).toBe("odata://TestService/TestResource");
      });

      it("should handle undefined query parameter values", async () => {
        // Arrange
        const model = new McpResourceAnnotation(
          "DynamicResource",
          "Test description",
          "TestEntity",
          "TestService",
          new Set(["filter"]),
          new Map(),
          new Map(),
          new Map(),
        );

        const mockService = {
          run: jest.fn().mockResolvedValue([]),
          tx: jest.fn().mockReturnValue({
            run: jest.fn().mockResolvedValue([]),
          }),
        };
        (cds as any).services["TestService"] = mockService;

        assignResourceToServer(model, mockServer as any, false);
        const handler = mockServer.registerResource.getCall(0).args[3] as any;

        // Act
        await handler(new URL("http://test.com"), {
          top: undefined,
          skip: undefined,
        });

        // Assert
        expect(mockQuery.limit).toHaveBeenCalledWith(100, undefined);
      });

      it("should handle select parameter with multiple columns", async () => {
        // Arrange
        const model = new McpResourceAnnotation(
          "DynamicResource",
          "Test description",
          "TestEntity",
          "TestService",
          new Set(["select"]),
          new Map(),
          new Map(),
          new Map(),
        );

        const mockService = {
          run: jest.fn().mockResolvedValue([]),
          tx: jest.fn().mockReturnValue({
            run: jest.fn().mockResolvedValue([]),
          }),
        };
        (cds as any).services["TestService"] = mockService;

        assignResourceToServer(model, mockServer as any, false);
        const handler = mockServer.registerResource.getCall(0).args[3] as any;

        // Act
        await handler(new URL("http://test.com"), {
          select: "id%2Cname%2Cdescription%2CcreatedAt",
        });

        // Assert
        expect(mockQuery.columns).toHaveBeenCalledWith([
          "id",
          "name",
          "description",
          "createdAt",
        ]);
      });

      it("should ignore unknown query parameters", async () => {
        // Arrange
        const model = new McpResourceAnnotation(
          "DynamicResource",
          "Test description",
          "TestEntity",
          "TestService",
          new Set(["filter"]),
          new Map(),
          new Map(),
          new Map(),
        );

        const mockService = {
          run: jest.fn().mockResolvedValue([]),
          tx: jest.fn().mockReturnValue({
            run: jest.fn().mockResolvedValue([]),
          }),
        };
        (cds as any).services["TestService"] = mockService;

        assignResourceToServer(model, mockServer as any, false);
        const handler = mockServer.registerResource.getCall(0).args[3] as any;

        // Act
        await handler(new URL("http://test.com"), {
          unknownParam1: "value1",
          unknownParam2: "value2",
          randomStuff: "ignored",
        });

        // Assert - Should still work and only use known parameters
        expect(SELECT.from).toHaveBeenCalledWith("TestEntity");
        expect(mockQuery.limit).toHaveBeenCalledWith(100, undefined);
        expect(mockService.tx).toHaveBeenCalledWith({
          user: { id: "privileged", name: "Privileged User" },
        });
        expect(mockService.tx().run).toHaveBeenCalledWith(mockQuery);
      });

      it("should handle very large result sets", async () => {
        // Arrange
        const model = new McpResourceAnnotation(
          "TestResource",
          "Test description",
          "TestEntity",
          "TestService",
          new Set(),
          new Map(),
          new Map(),
          new Map(),
        );

        const largeResult = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          data: "x".repeat(100), // Some larger data per item
        }));

        const mockService = {
          run: jest.fn().mockResolvedValue(largeResult),
          tx: jest.fn().mockReturnValue({
            run: jest.fn().mockResolvedValue(largeResult),
          }),
        };
        (cds as any).services["TestService"] = mockService;

        assignResourceToServer(model, mockServer as any, false);
        const handler = mockServer.registerResource.getCall(0).args[3] as any;

        // Act
        const result = await handler(new URL("http://test.com"), {});

        // Assert
        expect(result.contents[0].text).toBe(JSON.stringify(largeResult));
        expect(JSON.parse(result.contents[0].text as string)).toHaveLength(
          1000,
        );
      });
    });

    describe("Omitted Fields (@mcp.omit)", () => {
      describe("Dynamic Resources with Omitted Fields", () => {
        it("should omit single field from dynamic resource response", async () => {
          // Arrange
          const omittedFields = new Set(["secretMessage"]);
          const model = new McpResourceAnnotation(
            "BooksResource",
            "Books data",
            "Books",
            "CatalogService",
            new Set(["filter"]),
            new Map([
              ["ID", "Integer"],
              ["title", "String"],
              ["author", "String"],
              ["secretMessage", "String"],
            ]),
            new Map([["ID", "Integer"]]),
            new Map(),
            { tools: false },
            undefined,
            undefined,
            omittedFields,
          );

          const mockResponse = [
            {
              ID: 1,
              title: "Test Book",
              author: "Test Author",
              secretMessage: "This should be hidden",
            },
            {
              ID: 2,
              title: "Another Book",
              author: "Another Author",
              secretMessage: "Also hidden",
            },
          ];

          const mockService = {
            tx: jest.fn().mockReturnValue({
              run: jest.fn().mockResolvedValue(mockResponse),
            }),
          };
          (cds as any).services["CatalogService"] = mockService;

          assignResourceToServer(model, mockServer as any, false);
          const handler = mockServer.registerResource.getCall(0).args[3] as any;

          // Act
          const result = await handler(new URL("http://test.com"), {});

          // Assert
          const parsedResult = JSON.parse(result.contents[0].text);
          expect(parsedResult).toHaveLength(2);
          expect(parsedResult[0]).toHaveProperty("ID", 1);
          expect(parsedResult[0]).toHaveProperty("title", "Test Book");
          expect(parsedResult[0]).toHaveProperty("author", "Test Author");
          expect(parsedResult[0]).not.toHaveProperty("secretMessage");
          expect(parsedResult[1]).not.toHaveProperty("secretMessage");
        });

        it("should omit multiple fields from dynamic resource response", async () => {
          // Arrange
          const omittedFields = new Set(["password", "ssn", "creditCard"]);
          const model = new McpResourceAnnotation(
            "UsersResource",
            "User data",
            "Users",
            "UserService",
            new Set(["filter", "select"]),
            new Map([
              ["ID", "Integer"],
              ["name", "String"],
              ["email", "String"],
              ["password", "String"],
              ["ssn", "String"],
              ["creditCard", "String"],
            ]),
            new Map([["ID", "Integer"]]),
            new Map(),
            { tools: false },
            undefined,
            undefined,
            omittedFields,
          );

          const mockResponse = [
            {
              ID: 1,
              name: "John Doe",
              email: "john@example.com",
              password: "secret123",
              ssn: "123-45-6789",
              creditCard: "1234-5678-9012-3456",
            },
          ];

          const mockService = {
            tx: jest.fn().mockReturnValue({
              run: jest.fn().mockResolvedValue(mockResponse),
            }),
          };
          (cds as any).services["UserService"] = mockService;

          assignResourceToServer(model, mockServer as any, false);
          const handler = mockServer.registerResource.getCall(0).args[3] as any;

          // Act
          const result = await handler(new URL("http://test.com"), {});

          // Assert
          const parsedResult = JSON.parse(result.contents[0].text);
          expect(parsedResult[0]).toHaveProperty("ID", 1);
          expect(parsedResult[0]).toHaveProperty("name", "John Doe");
          expect(parsedResult[0]).toHaveProperty("email", "john@example.com");
          expect(parsedResult[0]).not.toHaveProperty("password");
          expect(parsedResult[0]).not.toHaveProperty("ssn");
          expect(parsedResult[0]).not.toHaveProperty("creditCard");
        });

        it("should handle empty result set with omitted fields", async () => {
          // Arrange
          const omittedFields = new Set(["secretField"]);
          const model = new McpResourceAnnotation(
            "DataResource",
            "Data",
            "Data",
            "DataService",
            new Set(["filter"]),
            new Map([
              ["ID", "Integer"],
              ["data", "String"],
              ["secretField", "String"],
            ]),
            new Map([["ID", "Integer"]]),
            new Map(),
            { tools: false },
            undefined,
            undefined,
            omittedFields,
          );

          const mockService = {
            tx: jest.fn().mockReturnValue({
              run: jest.fn().mockResolvedValue([]),
            }),
          };
          (cds as any).services["DataService"] = mockService;

          assignResourceToServer(model, mockServer as any, false);
          const handler = mockServer.registerResource.getCall(0).args[3] as any;

          // Act
          const result = await handler(new URL("http://test.com"), {});

          // Assert
          const parsedResult = JSON.parse(result.contents[0].text);
          expect(parsedResult).toEqual([]);
        });

        it("should handle omitted fields with various data types", async () => {
          // Arrange
          const omittedFields = new Set(["secretNumber", "secretBoolean"]);
          const model = new McpResourceAnnotation(
            "ProductsResource",
            "Products",
            "Products",
            "ProductService",
            new Set(["filter"]),
            new Map([
              ["ID", "Integer"],
              ["title", "String"],
              ["price", "Decimal"],
              ["inStock", "Boolean"],
              ["secretNumber", "Integer"],
              ["secretBoolean", "Boolean"],
            ]),
            new Map([["ID", "Integer"]]),
            new Map(),
            { tools: false },
            undefined,
            undefined,
            omittedFields,
          );

          const mockResponse = [
            {
              ID: 1,
              title: "Product A",
              price: 99.99,
              inStock: true,
              secretNumber: 42,
              secretBoolean: false,
            },
          ];

          const mockService = {
            tx: jest.fn().mockReturnValue({
              run: jest.fn().mockResolvedValue(mockResponse),
            }),
          };
          (cds as any).services["ProductService"] = mockService;

          assignResourceToServer(model, mockServer as any, false);
          const handler = mockServer.registerResource.getCall(0).args[3] as any;

          // Act
          const result = await handler(new URL("http://test.com"), {});

          // Assert
          const parsedResult = JSON.parse(result.contents[0].text);
          expect(parsedResult[0]).toHaveProperty("ID", 1);
          expect(parsedResult[0]).toHaveProperty("title", "Product A");
          expect(parsedResult[0]).toHaveProperty("price", 99.99);
          expect(parsedResult[0]).toHaveProperty("inStock", true);
          expect(parsedResult[0]).not.toHaveProperty("secretNumber");
          expect(parsedResult[0]).not.toHaveProperty("secretBoolean");
        });

        it("should work correctly when no fields are omitted", async () => {
          // Arrange - no omitted fields specified
          const model = new McpResourceAnnotation(
            "ItemsResource",
            "Items",
            "Items",
            "ItemService",
            new Set(["filter"]),
            new Map([
              ["ID", "Integer"],
              ["name", "String"],
              ["value", "Decimal"],
            ]),
            new Map([["ID", "Integer"]]),
            new Map(),
            { tools: false },
            undefined,
            undefined,
            undefined, // No omitted fields
          );

          const mockResponse = [
            {
              ID: 1,
              name: "Item One",
              value: 100.5,
            },
          ];

          const mockService = {
            tx: jest.fn().mockReturnValue({
              run: jest.fn().mockResolvedValue(mockResponse),
            }),
          };
          (cds as any).services["ItemService"] = mockService;

          assignResourceToServer(model, mockServer as any, false);
          const handler = mockServer.registerResource.getCall(0).args[3] as any;

          // Act
          const result = await handler(new URL("http://test.com"), {});

          // Assert
          const parsedResult = JSON.parse(result.contents[0].text);
          expect(parsedResult[0]).toHaveProperty("ID", 1);
          expect(parsedResult[0]).toHaveProperty("name", "Item One");
          expect(parsedResult[0]).toHaveProperty("value", 100.5);
        });

        it("should handle omitted fields with null values", async () => {
          // Arrange
          const omittedFields = new Set(["secretField"]);
          const model = new McpResourceAnnotation(
            "RecordsResource",
            "Records",
            "Records",
            "RecordService",
            new Set(["filter"]),
            new Map([
              ["ID", "Integer"],
              ["title", "String"],
              ["description", "String"],
              ["secretField", "String"],
            ]),
            new Map([["ID", "Integer"]]),
            new Map(),
            { tools: false },
            undefined,
            undefined,
            omittedFields,
          );

          const mockResponse = [
            {
              ID: 1,
              title: "Test",
              description: null,
              secretField: null,
            },
          ];

          const mockService = {
            tx: jest.fn().mockReturnValue({
              run: jest.fn().mockResolvedValue(mockResponse),
            }),
          };
          (cds as any).services["RecordService"] = mockService;

          assignResourceToServer(model, mockServer as any, false);
          const handler = mockServer.registerResource.getCall(0).args[3] as any;

          // Act
          const result = await handler(new URL("http://test.com"), {});

          // Assert
          const parsedResult = JSON.parse(result.contents[0].text);
          expect(parsedResult[0]).toHaveProperty("ID", 1);
          expect(parsedResult[0]).toHaveProperty("title", "Test");
          expect(parsedResult[0]).toHaveProperty("description", null);
          expect(parsedResult[0]).not.toHaveProperty("secretField");
        });
      });

      describe("Static Resources with Omitted Fields", () => {
        it("should omit single field from static resource response", async () => {
          // Arrange
          const omittedFields = new Set(["secretMessage"]);
          const model = new McpResourceAnnotation(
            "BooksResource",
            "Books data",
            "Books",
            "CatalogService",
            new Set(), // No functionalities - static resource
            new Map([
              ["ID", "Integer"],
              ["title", "String"],
              ["author", "String"],
              ["secretMessage", "String"],
            ]),
            new Map([["ID", "Integer"]]),
            new Map(),
            { tools: false },
            undefined,
            undefined,
            omittedFields,
          );

          const mockResponse = [
            {
              ID: 1,
              title: "Test Book",
              author: "Test Author",
              secretMessage: "This should be hidden",
            },
          ];

          const mockService = {
            tx: jest.fn().mockReturnValue({
              run: jest.fn().mockResolvedValue(mockResponse),
            }),
          };
          (cds as any).services["CatalogService"] = mockService;

          assignResourceToServer(model, mockServer as any, false);
          const handler = mockServer.registerResource.getCall(0).args[3] as any;

          // Act
          const result = await handler(new URL("http://test.com"), {});

          // Assert
          const parsedResult = JSON.parse(result.contents[0].text);
          expect(parsedResult).toHaveLength(1);
          expect(parsedResult[0]).toHaveProperty("ID", 1);
          expect(parsedResult[0]).toHaveProperty("title", "Test Book");
          expect(parsedResult[0]).toHaveProperty("author", "Test Author");
          expect(parsedResult[0]).not.toHaveProperty("secretMessage");
        });

        it("should omit multiple fields from static resource response", async () => {
          // Arrange
          const omittedFields = new Set([
            "internalNote",
            "costPrice",
            "supplierId",
          ]);
          const model = new McpResourceAnnotation(
            "ProductsResource",
            "Products",
            "Products",
            "ProductService",
            new Set(), // Static resource
            new Map([
              ["ID", "Integer"],
              ["name", "String"],
              ["price", "Decimal"],
              ["internalNote", "String"],
              ["costPrice", "Decimal"],
              ["supplierId", "Integer"],
            ]),
            new Map([["ID", "Integer"]]),
            new Map(),
            { tools: false },
            undefined,
            undefined,
            omittedFields,
          );

          const mockResponse = [
            {
              ID: 1,
              name: "Widget",
              price: 19.99,
              internalNote: "Supplier A preferred",
              costPrice: 10.5,
              supplierId: 42,
            },
            {
              ID: 2,
              name: "Gadget",
              price: 29.99,
              internalNote: "Bulk discount available",
              costPrice: 15.0,
              supplierId: 43,
            },
          ];

          const mockService = {
            tx: jest.fn().mockReturnValue({
              run: jest.fn().mockResolvedValue(mockResponse),
            }),
          };
          (cds as any).services["ProductService"] = mockService;

          assignResourceToServer(model, mockServer as any, false);
          const handler = mockServer.registerResource.getCall(0).args[3] as any;

          // Act
          const result = await handler(new URL("http://test.com"), {});

          // Assert
          const parsedResult = JSON.parse(result.contents[0].text);
          expect(parsedResult).toHaveLength(2);
          expect(parsedResult[0]).toHaveProperty("ID", 1);
          expect(parsedResult[0]).toHaveProperty("name", "Widget");
          expect(parsedResult[0]).toHaveProperty("price", 19.99);
          expect(parsedResult[0]).not.toHaveProperty("internalNote");
          expect(parsedResult[0]).not.toHaveProperty("costPrice");
          expect(parsedResult[0]).not.toHaveProperty("supplierId");
          expect(parsedResult[1]).not.toHaveProperty("internalNote");
          expect(parsedResult[1]).not.toHaveProperty("costPrice");
          expect(parsedResult[1]).not.toHaveProperty("supplierId");
        });

        it("should handle static resource with empty omitted fields set", async () => {
          // Arrange
          const omittedFields = new Set<string>(); // Empty set
          const model = new McpResourceAnnotation(
            "ItemsResource",
            "Items",
            "Items",
            "ItemService",
            new Set(),
            new Map([
              ["ID", "Integer"],
              ["name", "String"],
            ]),
            new Map([["ID", "Integer"]]),
            new Map(),
            { tools: false },
            undefined,
            undefined,
            omittedFields,
          );

          const mockResponse = [
            {
              ID: 1,
              name: "Item One",
            },
          ];

          const mockService = {
            tx: jest.fn().mockReturnValue({
              run: jest.fn().mockResolvedValue(mockResponse),
            }),
          };
          (cds as any).services["ItemService"] = mockService;

          assignResourceToServer(model, mockServer as any, false);
          const handler = mockServer.registerResource.getCall(0).args[3] as any;

          // Act
          const result = await handler(new URL("http://test.com"), {});

          // Assert
          const parsedResult = JSON.parse(result.contents[0].text);
          expect(parsedResult[0]).toHaveProperty("ID", 1);
          expect(parsedResult[0]).toHaveProperty("name", "Item One");
        });

        it("should handle static resource when all fields are omitted except keys", async () => {
          // Arrange
          const omittedFields = new Set(["field1", "field2", "field3"]);
          const model = new McpResourceAnnotation(
            "MinimalResource",
            "Minimal data",
            "Minimal",
            "MinimalService",
            new Set(),
            new Map([
              ["ID", "Integer"],
              ["field1", "String"],
              ["field2", "String"],
              ["field3", "String"],
            ]),
            new Map([["ID", "Integer"]]),
            new Map(),
            { tools: false },
            undefined,
            undefined,
            omittedFields,
          );

          const mockResponse = [
            {
              ID: 1,
              field1: "value1",
              field2: "value2",
              field3: "value3",
            },
          ];

          const mockService = {
            tx: jest.fn().mockReturnValue({
              run: jest.fn().mockResolvedValue(mockResponse),
            }),
          };
          (cds as any).services["MinimalService"] = mockService;

          assignResourceToServer(model, mockServer as any, false);
          const handler = mockServer.registerResource.getCall(0).args[3] as any;

          // Act
          const result = await handler(new URL("http://test.com"), {});

          // Assert
          const parsedResult = JSON.parse(result.contents[0].text);
          expect(parsedResult[0]).toHaveProperty("ID", 1);
          expect(parsedResult[0]).not.toHaveProperty("field1");
          expect(parsedResult[0]).not.toHaveProperty("field2");
          expect(parsedResult[0]).not.toHaveProperty("field3");
          // Should only have ID field
          expect(Object.keys(parsedResult[0])).toEqual(["ID"]);
        });

        it("should handle static resource with complex nested data", async () => {
          // Arrange
          const omittedFields = new Set(["secretData"]);
          const model = new McpResourceAnnotation(
            "ComplexResource",
            "Complex data",
            "Complex",
            "ComplexService",
            new Set(),
            new Map([
              ["ID", "Integer"],
              ["title", "String"],
              ["metadata", "Object"],
              ["secretData", "Object"],
            ]),
            new Map([["ID", "Integer"]]),
            new Map(),
            { tools: false },
            undefined,
            undefined,
            omittedFields,
          );

          const mockResponse = [
            {
              ID: 1,
              title: "Complex Item",
              metadata: {
                created: "2024-01-01",
                updated: "2024-01-02",
              },
              secretData: {
                internal: "hidden value",
                confidential: true,
              },
            },
          ];

          const mockService = {
            tx: jest.fn().mockReturnValue({
              run: jest.fn().mockResolvedValue(mockResponse),
            }),
          };
          (cds as any).services["ComplexService"] = mockService;

          assignResourceToServer(model, mockServer as any, false);
          const handler = mockServer.registerResource.getCall(0).args[3] as any;

          // Act
          const result = await handler(new URL("http://test.com"), {});

          // Assert
          const parsedResult = JSON.parse(result.contents[0].text);
          expect(parsedResult[0]).toHaveProperty("ID", 1);
          expect(parsedResult[0]).toHaveProperty("title", "Complex Item");
          expect(parsedResult[0]).toHaveProperty("metadata");
          expect(parsedResult[0].metadata).toEqual({
            created: "2024-01-01",
            updated: "2024-01-02",
          });
          expect(parsedResult[0]).not.toHaveProperty("secretData");
        });
      });

      describe("Edge Cases for Omitted Fields", () => {
        it("should not fail when omitted field does not exist in response", async () => {
          // Arrange
          const omittedFields = new Set(["nonExistentField"]);
          const model = new McpResourceAnnotation(
            "TestResource",
            "Test",
            "Test",
            "TestService",
            new Set(["filter"]),
            new Map([
              ["ID", "Integer"],
              ["name", "String"],
            ]),
            new Map([["ID", "Integer"]]),
            new Map(),
            { tools: false },
            undefined,
            undefined,
            omittedFields,
          );

          const mockResponse = [
            {
              ID: 1,
              name: "Test",
            },
          ];

          const mockService = {
            tx: jest.fn().mockReturnValue({
              run: jest.fn().mockResolvedValue(mockResponse),
            }),
          };
          (cds as any).services["TestService"] = mockService;

          assignResourceToServer(model, mockServer as any, false);
          const handler = mockServer.registerResource.getCall(0).args[3] as any;

          // Act
          const result = await handler(new URL("http://test.com"), {});

          // Assert
          const parsedResult = JSON.parse(result.contents[0].text);
          expect(parsedResult[0]).toHaveProperty("ID", 1);
          expect(parsedResult[0]).toHaveProperty("name", "Test");
        });

        it("should handle large result sets with omitted fields efficiently", async () => {
          // Arrange
          const omittedFields = new Set(["sensitiveData", "internalId"]);
          const model = new McpResourceAnnotation(
            "LargeResource",
            "Large dataset",
            "LargeData",
            "LargeService",
            new Set(["filter"]),
            new Map([
              ["ID", "Integer"],
              ["name", "String"],
              ["value", "Decimal"],
              ["sensitiveData", "String"],
              ["internalId", "Integer"],
            ]),
            new Map([["ID", "Integer"]]),
            new Map(),
            { tools: false },
            undefined,
            undefined,
            omittedFields,
          );

          const mockResponse = Array.from({ length: 500 }, (_, i) => ({
            ID: i,
            name: `Item ${i}`,
            value: i * 10.5,
            sensitiveData: `secret-${i}`,
            internalId: i * 1000,
          }));

          const mockService = {
            tx: jest.fn().mockReturnValue({
              run: jest.fn().mockResolvedValue(mockResponse),
            }),
          };
          (cds as any).services["LargeService"] = mockService;

          assignResourceToServer(model, mockServer as any, false);
          const handler = mockServer.registerResource.getCall(0).args[3] as any;

          // Act
          const result = await handler(new URL("http://test.com"), {});

          // Assert
          const parsedResult = JSON.parse(result.contents[0].text);
          expect(parsedResult).toHaveLength(500);
          // Check first and last items
          expect(parsedResult[0]).toHaveProperty("ID", 0);
          expect(parsedResult[0]).toHaveProperty("name", "Item 0");
          expect(parsedResult[0]).toHaveProperty("value", 0);
          expect(parsedResult[0]).not.toHaveProperty("sensitiveData");
          expect(parsedResult[0]).not.toHaveProperty("internalId");
          expect(parsedResult[499]).not.toHaveProperty("sensitiveData");
          expect(parsedResult[499]).not.toHaveProperty("internalId");
        });
      });
    });
  });
});
