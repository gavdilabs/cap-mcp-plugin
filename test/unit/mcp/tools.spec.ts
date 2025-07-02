import sinon from "sinon";
import { assignToolToServer } from "../../../src/mcp/tools";
import { McpToolAnnotation } from "../../../src/annotations/structures";
import { ERR_MISSING_SERVICE } from "../../../src//mcp/constants";

import cds from "@sap/cds";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as utils from "../../../src/mcp/utils";

// Mock CDS module completely
jest.mock("@sap/cds", () => ({
  test: jest.fn().mockResolvedValue(undefined),
  services: {},
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

describe("tools.ts", () => {
  let mockServer: sinon.SinonStubbedInstance<McpServer>;
  let loggerDebugStub: sinon.SinonStub;
  let loggerErrorStub: sinon.SinonStub;
  let determineMcpParameterTypeStub: sinon.SinonStub;

  beforeEach(async () => {
    // Initialize CDS test environment
    await cds.test("./");

    // Clear services
    (cds as any).services = {};

    // Setup stubs
    mockServer = sinon.createStubInstance(McpServer);

    determineMcpParameterTypeStub = sinon.stub(
      utils,
      "determineMcpParameterType",
    );
  });

  afterEach(() => {
    sinon.restore();
    jest.clearAllMocks();
  });

  describe("assignToolToServer", () => {
    describe("Unbound Operations", () => {
      it("should register unbound operation tool successfully", async () => {
        // Arrange
        const model = new McpToolAnnotation(
          "TestTool",
          "Test tool description",
          "testAction",
          "TestService",
          new Map([
            ["param1", "string"],
            ["param2", "number"],
          ]),
        );

        determineMcpParameterTypeStub
          .withArgs("string")
          .returns({ type: "string" });
        determineMcpParameterTypeStub
          .withArgs("number")
          .returns({ type: "number" });

        const mockService = {
          send: jest.fn().mockResolvedValue("success"),
        };
        (cds as any).services["TestService"] = mockService;

        // Act
        assignToolToServer(model, mockServer as any);

        // Assert
        sinon.assert.called(mockServer.registerTool);
        expect(mockServer.registerTool.getCall(0).args).toEqual([
          "TestTool",
          {
            param1: { type: "string" },
            param2: { type: "number" },
          },
          expect.any(Function),
        ]);

        // Test the registered handler
        const registerCall = mockServer.registerTool.getCall(0) as any;
        const handler = registerCall.args[2];
        const inputData = { param1: "test", param2: 42 };

        const result = await handler(inputData);

        expect(mockService.send).toHaveBeenCalledWith("testAction", inputData);
        expect(result.content).toEqual([{ type: "text", text: "success" }]);
      });

      it("should handle array response in unbound operation", async () => {
        // Arrange
        const model = new McpToolAnnotation(
          "TestTool",
          "Test tool description",
          "testAction",
          "TestService",
          new Map(),
        );

        const mockService = {
          send: jest.fn().mockResolvedValue(["result1", "result2"]),
        };
        (cds as any).services["TestService"] = mockService;

        assignToolToServer(model, mockServer as any);
        const handler = mockServer.registerTool.getCall(0).args[2] as any;

        // Act
        const result = await handler({});

        // Assert
        expect(result.content).toEqual([
          { type: "text", text: "result1" },
          { type: "text", text: "result2" },
        ]);
      });

      it("should handle missing service in unbound operation", async () => {
        // Arrange
        const model = new McpToolAnnotation(
          "TestTool",
          "Test tool description",
          "testAction",
          "NonExistentService",
          new Map(),
        );

        // No service added to cds.services

        assignToolToServer(model, mockServer as any);
        const handler = mockServer.registerTool.getCall(0).args[2] as any;

        // Act
        const result = await handler({});

        // Assert
        expect(result.isError).toBe(true);
        expect(result.content).toEqual([
          { type: "text", text: ERR_MISSING_SERVICE },
        ]);
      });

      it("should handle undefined parameters in unbound operation", () => {
        // Arrange
        const model = new McpToolAnnotation(
          "TestTool",
          "Test tool description",
          "testAction",
          "TestService",
          undefined,
        );

        const mockService = {
          send: jest.fn().mockResolvedValue("success"),
        };
        (cds as any).services["TestService"] = mockService;

        // Act
        assignToolToServer(model, mockServer as any);

        // Assert
        sinon.assert.called(mockServer.registerTool);
        expect(mockServer.registerTool.getCall(0).args).toEqual([
          "TestTool",
          {},
          expect.any(Function),
        ]);
      });

      it("should handle empty parameters map in unbound operation", () => {
        // Arrange
        const model = new McpToolAnnotation(
          "TestTool",
          "Test tool description",
          "testAction",
          "TestService",
          new Map(),
        );

        const mockService = {
          send: jest.fn().mockResolvedValue("success"),
        };
        (cds as any).services["TestService"] = mockService;

        // Act
        assignToolToServer(model, mockServer as any);

        // Assert
        sinon.assert.called(mockServer.registerTool);
        expect(mockServer.registerTool.getCall(0).args).toEqual([
          "TestTool",
          {},
          expect.any(Function),
        ]);
      });

      it("should handle complex object responses in unbound operation", async () => {
        // Arrange
        const model = new McpToolAnnotation(
          "TestTool",
          "Test tool description",
          "testAction",
          "TestService",
          new Map(),
        );

        const complexResponse = {
          nested: { data: "value" },
          array: [1, 2, 3],
        };

        const mockService = {
          send: jest.fn().mockResolvedValue(complexResponse),
        };
        (cds as any).services["TestService"] = mockService;

        assignToolToServer(model, mockServer as any);
        const handler = mockServer.registerTool.getCall(0).args[2] as any;

        // Act
        const result = await handler({});

        // Assert
        expect(result.content).toEqual([
          { type: "text", text: "[object Object]" },
        ]);
      });
    });

    describe("Bound Operations", () => {
      it("should register bound operation tool successfully", async () => {
        // Arrange
        const model = new McpToolAnnotation(
          "BoundTool",
          "Bound tool description",
          "boundAction",
          "TestService",
          new Map([["param1", "string"]]),
          "TestEntity",
          "action",
          new Map([["id", "number"]]),
        );

        determineMcpParameterTypeStub
          .withArgs("string")
          .returns({ type: "string" });
        determineMcpParameterTypeStub
          .withArgs("number")
          .returns({ type: "number" });

        const mockService = {
          send: jest.fn().mockResolvedValue({ result: "bound success" }),
        };

        (cds as any).services["TestService"] = mockService;

        // Act
        assignToolToServer(model, mockServer as any);

        // Assert
        sinon.assert.called(mockServer.registerTool);
        expect(mockServer.registerTool.getCall(0).args).toEqual([
          "BoundTool",
          {
            id: { type: "number" },
            param1: { type: "string" },
          },
          expect.any(Function),
        ]);

        // Test the registered handler
        const registerCall = mockServer.registerTool.getCall(0) as any;
        const handler = registerCall.args[2];
        const inputData = { id: 123, param1: "test", extraParam: "ignored" };

        const result = await handler(inputData);

        expect(mockService.send).toHaveBeenCalledWith({
          event: "boundAction",
          entity: "TestEntity",
          data: { param1: "test" },
          params: [{ id: 123 }],
        });
        expect(result.content).toEqual([
          { type: "text", text: "[object Object]" },
        ]);
      });

      it("should handle missing keyTypeMap for bound operation", () => {
        // Arrange
        const model = new McpToolAnnotation(
          "BoundTool",
          "Bound tool description",
          "boundAction",
          "TestService",
          new Map(),
          "TestEntity",
          "action",
          undefined,
        );

        // Act & Assert
        expect(() => assignToolToServer(model, mockServer as any)).toThrow(
          "Bound operation cannot be assigned to tool list, missing keys",
        );
      });

      it("should handle empty keyTypeMap for bound operation", () => {
        // Arrange
        const model = new McpToolAnnotation(
          "BoundTool",
          "Bound tool description",
          "boundAction",
          "TestService",
          new Map(),
          "TestEntity",
          "action",
          new Map(),
        );

        // Act & Assert
        expect(() => assignToolToServer(model, mockServer as any)).toThrow(
          "Bound operation cannot be assigned to tool list, missing keys",
        );
      });

      it("should handle missing service in bound operation", async () => {
        // Arrange
        const model = new McpToolAnnotation(
          "BoundTool",
          "Bound tool description",
          "boundAction",
          "NonExistentService",
          new Map(),
          "TestEntity",
          "action",
          new Map([["id", "number"]]),
        );

        // No service added to cds.services

        assignToolToServer(model, mockServer as any);
        const handler = mockServer.registerTool.getCall(0).args[2] as any;

        // Act
        const result = await handler({ id: 123 });

        // Assert
        expect(result.isError).toBe(true);
        expect(result.content).toEqual([
          { type: "text", text: ERR_MISSING_SERVICE },
        ]);
      });

      it("should filter parameters correctly in bound operation", async () => {
        // Arrange
        const model = new McpToolAnnotation(
          "BoundTool",
          "Bound tool description",
          "boundAction",
          "TestService",
          new Map([["validParam", "string"]]),
          "TestEntity",
          "action",
          new Map([["id", "number"]]),
        );

        determineMcpParameterTypeStub
          .withArgs("string")
          .returns({ type: "string" });
        determineMcpParameterTypeStub
          .withArgs("number")
          .returns({ type: "number" });

        const mockService = {
          send: jest.fn().mockResolvedValue("success"),
        };
        (cds as any).services["TestService"] = mockService;

        assignToolToServer(model, mockServer as any);
        const handler = mockServer.registerTool.getCall(0).args[2] as any;

        // Act
        await handler({
          id: 123,
          validParam: "test",
          invalidParam: "should be ignored",
        });

        // Assert
        expect(mockService.send).toHaveBeenCalledWith({
          event: "boundAction",
          entity: "TestEntity",
          data: { validParam: "test" },
          params: [{ id: 123 }],
        });
      });

      it("should handle multiple keys in bound operation", async () => {
        // Arrange
        const model = new McpToolAnnotation(
          "BoundTool",
          "Bound tool description",
          "boundAction",
          "TestService",
          new Map([["param1", "string"]]),
          "TestEntity",
          "action",
          new Map([
            ["id", "number"],
            ["version", "string"],
            ["tenant", "string"],
          ]),
        );

        determineMcpParameterTypeStub
          .withArgs("string")
          .returns({ type: "string" });
        determineMcpParameterTypeStub
          .withArgs("number")
          .returns({ type: "number" });

        const mockService = {
          send: jest.fn().mockResolvedValue("success"),
        };
        (cds as any).services["TestService"] = mockService;

        assignToolToServer(model, mockServer as any);
        const handler = mockServer.registerTool.getCall(0).args[2] as any;

        // Act
        await handler({
          id: 123,
          version: "v1.0",
          tenant: "test-tenant",
          param1: "test-value",
        });

        // Assert
        expect(mockService.send).toHaveBeenCalledWith({
          event: "boundAction",
          entity: "TestEntity",
          data: { param1: "test-value" },
          params: [
            {
              id: 123,
              version: "v1.0",
              tenant: "test-tenant",
            },
          ],
        });
      });

      it("should handle bound operation with no parameters", async () => {
        // Arrange
        const model = new McpToolAnnotation(
          "BoundTool",
          "Bound tool description",
          "boundAction",
          "TestService",
          undefined, // No parameters
          "TestEntity",
          "action",
          new Map([["id", "number"]]),
        );

        determineMcpParameterTypeStub
          .withArgs("number")
          .returns({ type: "number" });

        const mockService = {
          send: jest.fn().mockResolvedValue("success"),
        };
        (cds as any).services["TestService"] = mockService;

        assignToolToServer(model, mockServer as any);
        const handler = mockServer.registerTool.getCall(0).args[2] as any;

        // Act
        await handler({ id: 123 });

        // Assert
        expect(mockService.send).toHaveBeenCalledWith({
          event: "boundAction",
          entity: "TestEntity",
          data: {},
          params: [{ id: 123 }],
        });
      });

      it("should handle array response in bound operation", async () => {
        // Arrange
        const model = new McpToolAnnotation(
          "BoundTool",
          "Bound tool description",
          "boundAction",
          "TestService",
          new Map(),
          "TestEntity",
          "action",
          new Map([["id", "number"]]),
        );

        determineMcpParameterTypeStub
          .withArgs("number")
          .returns({ type: "number" });

        const mockService = {
          send: jest.fn().mockResolvedValue(["item1", "item2", "item3"]),
        };
        (cds as any).services["TestService"] = mockService;

        assignToolToServer(model, mockServer as any);
        const handler = mockServer.registerTool.getCall(0).args[2] as any;

        // Act
        const result = await handler({ id: 123 });

        // Assert
        expect(result.content).toEqual([
          { type: "text", text: "item1" },
          { type: "text", text: "item2" },
          { type: "text", text: "item3" },
        ]);
      });
    });

    describe("Edge Cases", () => {
      it("should handle null response in unbound operation", async () => {
        // Arrange
        const model = new McpToolAnnotation(
          "TestTool",
          "Test tool description",
          "testAction",
          "TestService",
          new Map(),
        );

        const mockService = {
          send: jest.fn().mockResolvedValue(null),
        };
        (cds as any).services["TestService"] = mockService;

        assignToolToServer(model, mockServer as any);
        const handler = mockServer.registerTool.getCall(0).args[2] as any;

        // Act
        const result = await handler({});

        // Assert
        expect(result.content).toEqual([{ type: "text", text: "null" }]);
      });

      it("should handle undefined response in unbound operation", async () => {
        // Arrange
        const model = new McpToolAnnotation(
          "TestTool",
          "Test tool description",
          "testAction",
          "TestService",
          new Map(),
        );

        const mockService = {
          send: jest.fn().mockResolvedValue(undefined),
        };
        (cds as any).services["TestService"] = mockService;

        assignToolToServer(model, mockServer as any);
        const handler = mockServer.registerTool.getCall(0).args[2] as any;

        // Act
        const result = await handler({});

        // Assert
        expect(result.content).toEqual([{ type: "text", text: "undefined" }]);
      });

      it("should handle boolean response in unbound operation", async () => {
        // Arrange
        const model = new McpToolAnnotation(
          "TestTool",
          "Test tool description",
          "testAction",
          "TestService",
          new Map(),
        );

        const mockService = {
          send: jest.fn().mockResolvedValue(true),
        };
        (cds as any).services["TestService"] = mockService;

        assignToolToServer(model, mockServer as any);
        const handler = mockServer.registerTool.getCall(0).args[2] as any;

        // Act
        const result = await handler({});

        // Assert
        expect(result.content).toEqual([{ type: "text", text: "true" }]);
      });

      it("should handle numeric response in unbound operation", async () => {
        // Arrange
        const model = new McpToolAnnotation(
          "TestTool",
          "Test tool description",
          "testAction",
          "TestService",
          new Map(),
        );

        const mockService = {
          send: jest.fn().mockResolvedValue(42),
        };
        (cds as any).services["TestService"] = mockService;

        assignToolToServer(model, mockServer as any);
        const handler = mockServer.registerTool.getCall(0).args[2] as any;

        // Act
        const result = await handler({});

        // Assert
        expect(result.content).toEqual([{ type: "text", text: "42" }]);
      });

      it("should handle empty array response", async () => {
        // Arrange
        const model = new McpToolAnnotation(
          "TestTool",
          "Test tool description",
          "testAction",
          "TestService",
          new Map(),
        );

        const mockService = {
          send: jest.fn().mockResolvedValue([]),
        };
        (cds as any).services["TestService"] = mockService;

        assignToolToServer(model, mockServer as any);
        const handler = mockServer.registerTool.getCall(0).args[2] as any;

        // Act
        const result = await handler({});

        // Assert
        expect(result.content).toEqual([]);
      });

      it("should handle mixed data in parameters for bound operation", async () => {
        // Arrange
        const model = new McpToolAnnotation(
          "BoundTool",
          "Bound tool description",
          "boundAction",
          "TestService",
          new Map([
            ["stringParam", "string"],
            ["numberParam", "number"],
            ["boolParam", "boolean"],
          ]),
          "TestEntity",
          "action",
          new Map([["id", "guid"]]),
        );

        determineMcpParameterTypeStub
          .withArgs("string")
          .returns({ type: "string" });
        determineMcpParameterTypeStub
          .withArgs("number")
          .returns({ type: "number" });
        determineMcpParameterTypeStub
          .withArgs("boolean")
          .returns({ type: "boolean" });
        determineMcpParameterTypeStub
          .withArgs("guid")
          .returns({ type: "string" });

        const mockService = {
          send: jest.fn().mockResolvedValue("success"),
        };
        (cds as any).services["TestService"] = mockService;

        assignToolToServer(model, mockServer as any);
        const handler = mockServer.registerTool.getCall(0).args[2] as any;

        // Act
        await handler({
          id: "guid-123-456",
          stringParam: "test-string",
          numberParam: 123.45,
          boolParam: true,
          extraIgnored: "ignored",
        });

        // Assert
        expect(mockService.send).toHaveBeenCalledWith({
          event: "boundAction",
          entity: "TestEntity",
          data: {
            stringParam: "test-string",
            numberParam: 123.45,
            boolParam: true,
          },
          params: [{ id: "guid-123-456" }],
        });
      });
    });
  });
});
