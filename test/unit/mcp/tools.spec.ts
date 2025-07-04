import sinon from "sinon";
import { assignToolToServer } from "../../../src/mcp/tools";
import { McpToolAnnotation } from "../../../src/annotations/structures";
import { ERR_MISSING_SERVICE } from "../../../src//mcp/constants";

import cds from "@sap/cds";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as utils from "../../../src/mcp/utils";
import { z } from "zod";

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

        determineMcpParameterTypeStub.withArgs("string").returns(z.string());
        determineMcpParameterTypeStub.withArgs("number").returns(z.number());

        const mockService = {
          send: jest.fn().mockResolvedValue("success"),
        };
        (cds as any).services["TestService"] = mockService;

        // Act
        assignToolToServer(model, mockServer as any);

        // Assert
        sinon.assert.called(mockServer.registerTool);
        const registerCall = mockServer.registerTool.getCall(0);
        expect(registerCall.args[0]).toBe("TestTool");
        expect(registerCall.args[1]).toEqual({
          title: "TestTool",
          description: "Test tool description",
          inputSchema: expect.objectContaining({
            param1: expect.any(z.ZodString),
            param2: expect.any(z.ZodNumber),
          }),
        });
        expect(registerCall.args[2]).toEqual(expect.any(Function));

        // Test the registered handler
        const handler = registerCall.args[2];
        const inputData = { param1: "test", param2: 42 };

        const mockExtra = {
          signal: new AbortController().signal,
          requestId: "test-request-id",
          sendNotification: jest.fn(),
          sendRequest: jest.fn(),
        };
        const result = await handler(inputData, mockExtra);

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
        const mockExtra = {
          signal: new AbortController().signal,
          requestId: "test-request-id",
          sendNotification: jest.fn(),
          sendRequest: jest.fn(),
        };
        const result = await handler({}, mockExtra);

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
        const mockExtra = {
          signal: new AbortController().signal,
          requestId: "test-request-id",
          sendNotification: jest.fn(),
          sendRequest: jest.fn(),
        };
        const result = await handler({}, mockExtra);

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
        const registerCall = mockServer.registerTool.getCall(0);
        expect(registerCall.args[0]).toBe("TestTool");
        expect(registerCall.args[1]).toEqual({
          title: "TestTool",
          description: "Test tool description",
          inputSchema: {},
        });
        expect(registerCall.args[2]).toEqual(expect.any(Function));
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
        const registerCall = mockServer.registerTool.getCall(0);
        expect(registerCall.args[0]).toBe("TestTool");
        expect(registerCall.args[1]).toEqual({
          title: "TestTool",
          description: "Test tool description",
          inputSchema: {},
        });
        expect(registerCall.args[2]).toEqual(expect.any(Function));
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
        const mockExtra = {
          signal: new AbortController().signal,
          requestId: "test-request-id",
          sendNotification: jest.fn(),
          sendRequest: jest.fn(),
        };
        const result = await handler({}, mockExtra);

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

        determineMcpParameterTypeStub.withArgs("string").returns(z.string());
        determineMcpParameterTypeStub.withArgs("number").returns(z.number());

        const mockService = {
          send: jest.fn().mockResolvedValue({ result: "bound success" }),
        };

        (cds as any).services["TestService"] = mockService;

        // Act
        assignToolToServer(model, mockServer as any);

        // Assert
        sinon.assert.called(mockServer.registerTool);
        const registerCall = mockServer.registerTool.getCall(0);
        expect(registerCall.args[0]).toBe("BoundTool");
        expect(registerCall.args[1]).toEqual({
          title: "BoundTool",
          description: "Bound tool description",
          inputSchema: expect.objectContaining({
            id: expect.any(z.ZodNumber),
            param1: expect.any(z.ZodString),
          }),
        });
        expect(registerCall.args[2]).toEqual(expect.any(Function));

        // Test the registered handler
        const handler = registerCall.args[2];
        const inputData = { id: 123, param1: "test", extraParam: "ignored" };

        const mockExtra = {
          signal: new AbortController().signal,
          requestId: "test-request-id",
          sendNotification: jest.fn(),
          sendRequest: jest.fn(),
        };
        const result = await handler(inputData, mockExtra);

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
        const mockExtra = {
          signal: new AbortController().signal,
          requestId: "test-request-id",
          sendNotification: jest.fn(),
          sendRequest: jest.fn(),
        };
        const result = await handler({ id: 123 }, mockExtra);

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
        const mockExtra = {
          signal: new AbortController().signal,
          requestId: "test-request-id",
          sendNotification: jest.fn(),
          sendRequest: jest.fn(),
        };
        await handler(
          {
            id: 123,
            validParam: "test",
            invalidParam: "should be ignored",
          },
          mockExtra,
        );

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
        const mockExtra = {
          signal: new AbortController().signal,
          requestId: "test-request-id",
          sendNotification: jest.fn(),
          sendRequest: jest.fn(),
        };
        await handler(
          {
            id: 123,
            version: "v1.0",
            tenant: "test-tenant",
            param1: "test-value",
          },
          mockExtra,
        );

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
        const mockExtra = {
          signal: new AbortController().signal,
          requestId: "test-request-id",
          sendNotification: jest.fn(),
          sendRequest: jest.fn(),
        };
        await handler({ id: 123 }, mockExtra);

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
        const mockExtra = {
          signal: new AbortController().signal,
          requestId: "test-request-id",
          sendNotification: jest.fn(),
          sendRequest: jest.fn(),
        };
        const result = await handler({ id: 123 }, mockExtra);

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
        const mockExtra = {
          signal: new AbortController().signal,
          requestId: "test-request-id",
          sendNotification: jest.fn(),
          sendRequest: jest.fn(),
        };
        const result = await handler({}, mockExtra);

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
        const mockExtra = {
          signal: new AbortController().signal,
          requestId: "test-request-id",
          sendNotification: jest.fn(),
          sendRequest: jest.fn(),
        };
        const result = await handler({}, mockExtra);

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
        const mockExtra = {
          signal: new AbortController().signal,
          requestId: "test-request-id",
          sendNotification: jest.fn(),
          sendRequest: jest.fn(),
        };
        const result = await handler({}, mockExtra);

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
        const mockExtra = {
          signal: new AbortController().signal,
          requestId: "test-request-id",
          sendNotification: jest.fn(),
          sendRequest: jest.fn(),
        };
        const result = await handler({}, mockExtra);

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
        const mockExtra = {
          signal: new AbortController().signal,
          requestId: "test-request-id",
          sendNotification: jest.fn(),
          sendRequest: jest.fn(),
        };
        const result = await handler({}, mockExtra);

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
        const mockExtra = {
          signal: new AbortController().signal,
          requestId: "test-request-id",
          sendNotification: jest.fn(),
          sendRequest: jest.fn(),
        };
        await handler(
          {
            id: "guid-123-456",
            stringParam: "test-string",
            numberParam: 123.45,
            boolParam: true,
            extraIgnored: "ignored",
          },
          mockExtra,
        );

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
