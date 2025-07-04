import sinon from "sinon";
import cds from "@sap/cds";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { CustomResourceTemplate } from "../../../src/mcp/customResourceTemplate";
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
        );

        const mockService = {
          run: jest.fn().mockResolvedValue([{ id: 1, name: "test" }]),
        };
        (cds as any).services["TestService"] = mockService;

        // Act
        assignResourceToServer(model, mockServer as any);

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
        expect(mockService.run).toHaveBeenCalledWith(mockQuery);
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
        );

        const mockService = {
          run: jest.fn().mockRejectedValue(new Error("Database error")),
        };
        (cds as any).services["TestService"] = mockService;

        assignResourceToServer(model, mockServer as any);
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
        );

        const mockService = {
          run: jest.fn().mockResolvedValue(null),
        };
        (cds as any).services["TestService"] = mockService;

        assignResourceToServer(model, mockServer as any);
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
        );

        const mockService = {
          run: jest.fn().mockResolvedValue([]),
        };
        (cds as any).services["TestService"] = mockService;

        assignResourceToServer(model, mockServer as any);
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
        );

        writeODataDescriptionStub.returns("Detailed OData description");

        // Act
        assignResourceToServer(model, mockServer as any);

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
        );

        const mockService = {
          run: jest.fn().mockResolvedValue([]),
        };
        (cds as any).services["TestService"] = mockService;

        (cds.parse.expr as jest.Mock).mockReturnValue("parsed expression");

        assignResourceToServer(model, mockServer as any);
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
        );

        // No service added to cds.services

        assignResourceToServer(model, mockServer as any);
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
        );

        const mockService = {
          run: jest.fn().mockRejectedValue(new Error("Service error")),
        };
        (cds as any).services["TestService"] = mockService;

        assignResourceToServer(model, mockServer as any);
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
        );

        const mockService = {
          run: jest.fn().mockResolvedValue([]),
        };
        (cds as any).services["TestService"] = mockService;

        assignResourceToServer(model, mockServer as any);
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
        );

        // Act
        assignResourceToServer(model, mockServer as any);

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
        );

        const mockService = {
          run: jest.fn().mockResolvedValue([]),
        };
        (cds as any).services["TestService"] = mockService;

        assignResourceToServer(model, mockServer as any);
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
        );

        const mockService = {
          run: jest.fn().mockResolvedValue([]),
        };
        (cds as any).services["TestService"] = mockService;

        assignResourceToServer(model, mockServer as any);
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
        );

        const mockService = {
          run: jest.fn().mockResolvedValue([]),
        };
        (cds as any).services["TestService"] = mockService;

        assignResourceToServer(model, mockServer as any);
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
        expect(mockService.run).toHaveBeenCalledWith(mockQuery);
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
        );

        const largeResult = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          data: "x".repeat(100), // Some larger data per item
        }));

        const mockService = {
          run: jest.fn().mockResolvedValue(largeResult),
        };
        (cds as any).services["TestService"] = mockService;

        assignResourceToServer(model, mockServer as any);
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
  });
});
