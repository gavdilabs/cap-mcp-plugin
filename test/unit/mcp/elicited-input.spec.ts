import {
  isElicitInput,
  constructElicitationFunctions,
  handleElicitationRequests,
  ElicitationResponse,
} from "../../../src/mcp/elicited-input";
import { McpToolAnnotation } from "../../../src/annotations/structures";
import { McpElicit } from "../../../src/annotations/types";
import { McpParameters } from "../../../src/mcp/types";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Mock logger
jest.mock("../../../src/logger", () => ({
  LOGGER: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

describe("elicited-input", () => {
  describe("isElicitInput", () => {
    test("should return true when elicits array contains 'input'", () => {
      const elicits: McpElicit[] = ["input"];
      expect(isElicitInput(elicits)).toBe(true);
    });

    test("should return true when elicits array contains 'input' and 'confirm'", () => {
      const elicits: McpElicit[] = ["input", "confirm"];
      expect(isElicitInput(elicits)).toBe(true);
    });

    test("should return false when elicits array contains only 'confirm'", () => {
      const elicits: McpElicit[] = ["confirm"];
      expect(isElicitInput(elicits)).toBe(false);
    });

    test("should return false when elicits array is empty", () => {
      const elicits: McpElicit[] = [];
      expect(isElicitInput(elicits)).toBe(false);
    });

    test("should return false when elicits is undefined", () => {
      expect(isElicitInput(undefined)).toBe(false);
    });
  });

  describe("constructElicitationFunctions", () => {
    let mockToolAnnotation: McpToolAnnotation;
    let mockParams: McpParameters;

    beforeEach(() => {
      mockToolAnnotation = new McpToolAnnotation(
        "test-tool",
        "Test tool description",
        "testOperation",
        "TestService",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        ["input", "confirm"],
      );

      mockParams = {
        param1: z.string(),
        param2: z.number(),
        param3: z.boolean(),
      };
    });

    test("should construct both input and confirm elicitation requests", () => {
      const result = constructElicitationFunctions(
        mockToolAnnotation,
        mockParams,
      );

      expect(result).toHaveLength(2);

      // Check input request
      const inputRequest = result.find(
        (r) => r.message === "Please fill out the required parameters",
      );
      expect(inputRequest).toBeDefined();
      expect(inputRequest?.requestedSchema.type).toBe("object");
      expect(inputRequest?.requestedSchema.required).toEqual([
        "param1",
        "param2",
        "param3",
      ]);
      expect(inputRequest?.requestedSchema.properties.param1.type).toBe(
        "string",
      );
      expect(inputRequest?.requestedSchema.properties.param2.type).toBe(
        "number",
      );
      expect(inputRequest?.requestedSchema.properties.param3.type).toBe(
        "boolean",
      );

      // Check confirm request
      const confirmRequest = result.find((r) =>
        r.message?.includes("Please confirm"),
      );
      expect(confirmRequest).toBeDefined();
      expect(confirmRequest?.message).toBe(
        "Please confirm that you want to perform action 'Test tool description'",
      );
      expect(confirmRequest?.requestedSchema.properties.confirm.type).toBe(
        "boolean",
      );
    });

    test("should construct only input elicitation request", () => {
      const toolWithInputOnly = new McpToolAnnotation(
        "test-tool",
        "Test tool description",
        "testOperation",
        "TestService",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        ["input"],
      );

      const result = constructElicitationFunctions(
        toolWithInputOnly,
        mockParams,
      );

      expect(result).toHaveLength(1);
      expect(result[0].message).toBe("Please fill out the required parameters");
    });

    test("should construct only confirm elicitation request", () => {
      const toolWithConfirmOnly = new McpToolAnnotation(
        "test-tool",
        "Test tool description",
        "testOperation",
        "TestService",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        ["confirm"],
      );

      const result = constructElicitationFunctions(
        toolWithConfirmOnly,
        mockParams,
      );

      expect(result).toHaveLength(1);
      expect(result[0].message).toBe(
        "Please confirm that you want to perform action 'Test tool description'",
      );
    });

    test("should return empty array when no elicits are defined", () => {
      const toolWithoutElicits = new McpToolAnnotation(
        "test-tool",
        "Test tool description",
        "testOperation",
        "TestService",
      );

      const result = constructElicitationFunctions(
        toolWithoutElicits,
        mockParams,
      );

      expect(result).toHaveLength(0);
    });

    test("should throw error for invalid elicitation type", () => {
      // We need to create a tool annotation with invalid elicit type
      // Since the type is restricted, we'll mock it
      const toolWithInvalidElicit = {
        ...mockToolAnnotation,
        elicits: ["invalid"] as any,
      } as McpToolAnnotation;

      expect(() =>
        constructElicitationFunctions(toolWithInvalidElicit, mockParams),
      ).toThrow("Invalid elicitation type");
    });

    test("should handle empty parameters for input elicitation", () => {
      const emptyParams: McpParameters = {};

      const result = constructElicitationFunctions(
        mockToolAnnotation,
        emptyParams,
      );

      expect(result).toHaveLength(2);
      const inputRequest = result.find(
        (r) => r.message === "Please fill out the required parameters",
      );
      expect(inputRequest?.requestedSchema.required).toEqual([]);
      expect(
        Object.keys(inputRequest?.requestedSchema.properties || {}),
      ).toHaveLength(0);
    });

    test("should throw error for unsupported parameter type", () => {
      const paramsWithUnsupportedType: McpParameters = {
        unsupported: z.object({ test: z.string() }),
      };

      expect(() =>
        constructElicitationFunctions(
          mockToolAnnotation,
          paramsWithUnsupportedType,
        ),
      ).toThrow("Unsupported elicitation input type");
    });
  });

  describe("handleElicitationRequests", () => {
    let mockServer: McpServer;

    beforeEach(() => {
      mockServer = {
        server: {
          elicitInput: jest.fn(),
        },
      } as any;
    });

    test("should return early response undefined when no requests", async () => {
      const result = await handleElicitationRequests(undefined, mockServer);
      expect(result).toEqual({ earlyResponse: undefined });
    });

    test("should return early response undefined when empty requests", async () => {
      const result = await handleElicitationRequests([], mockServer);
      expect(result).toEqual({ earlyResponse: undefined });
    });

    test("should handle accept response and collect input data", async () => {
      const mockRequests = [
        {
          message: "Please fill out the required parameters",
          requestedSchema: {
            type: "object" as const,
            properties: {},
            required: [],
          },
        },
        {
          message: "Please confirm that you want to perform action 'Test'",
          requestedSchema: {
            type: "object" as const,
            properties: {},
            required: [],
          },
        },
      ];

      const mockInputResponse: ElicitResult = {
        action: "accept",
        content: { param1: "test value", param2: 42 },
      };

      const mockConfirmResponse: ElicitResult = {
        action: "accept",
        content: { confirm: true },
      };

      (mockServer.server.elicitInput as jest.Mock)
        .mockResolvedValueOnce(mockInputResponse)
        .mockResolvedValueOnce(mockConfirmResponse);

      const result = await handleElicitationRequests(mockRequests, mockServer);

      expect(result.earlyResponse).toBeUndefined();
      expect(result.data).toEqual({ param1: "test value", param2: 42 });
      expect(mockServer.server.elicitInput).toHaveBeenCalledTimes(2);
    });

    test("should return early response when user declines", async () => {
      const mockRequests = [
        {
          message: "Please confirm that you want to perform action 'Test'",
          requestedSchema: {
            type: "object" as const,
            properties: {},
            required: [],
          },
        },
      ];

      const mockDeclineResponse: ElicitResult = {
        action: "decline",
      };

      (mockServer.server.elicitInput as jest.Mock).mockResolvedValueOnce(
        mockDeclineResponse,
      );

      const result = await handleElicitationRequests(mockRequests, mockServer);

      expect(result.earlyResponse).toEqual({
        content: [
          {
            type: "text",
            text: "Action was declined.",
          },
        ],
      });
      expect(result.data).toBeUndefined();
    });

    test("should return early response when user cancels", async () => {
      const mockRequests = [
        {
          message: "Please fill out the required parameters",
          requestedSchema: {
            type: "object" as const,
            properties: {},
            required: [],
          },
        },
      ];

      const mockCancelResponse: ElicitResult = {
        action: "cancel",
      };

      (mockServer.server.elicitInput as jest.Mock).mockResolvedValueOnce(
        mockCancelResponse,
      );

      const result = await handleElicitationRequests(mockRequests, mockServer);

      expect(result.earlyResponse).toEqual({
        content: [
          {
            type: "text",
            text: "Action was cancelled",
          },
        ],
      });
      expect(result.data).toBeUndefined();
    });

    test("should throw error for invalid elicit response", async () => {
      const mockRequests = [
        {
          message: "Test message",
          requestedSchema: {
            type: "object" as const,
            properties: {},
            required: [],
          },
        },
      ];

      const mockInvalidResponse: ElicitResult = {
        action: "invalid" as any,
      };

      (mockServer.server.elicitInput as jest.Mock).mockResolvedValueOnce(
        mockInvalidResponse,
      );

      await expect(
        handleElicitationRequests(mockRequests, mockServer),
      ).rejects.toThrow("Invalid elicit response received");
    });

    test("should handle multiple requests but return early on first decline", async () => {
      const mockRequests = [
        {
          message: "Please fill out the required parameters",
          requestedSchema: {
            type: "object" as const,
            properties: {},
            required: [],
          },
        },
        {
          message: "Please confirm that you want to perform action 'Test'",
          requestedSchema: {
            type: "object" as const,
            properties: {},
            required: [],
          },
        },
      ];

      const mockAcceptResponse: ElicitResult = {
        action: "accept",
        content: { param1: "test" },
      };

      const mockDeclineResponse: ElicitResult = {
        action: "decline",
      };

      (mockServer.server.elicitInput as jest.Mock)
        .mockResolvedValueOnce(mockAcceptResponse)
        .mockResolvedValueOnce(mockDeclineResponse);

      const result = await handleElicitationRequests(mockRequests, mockServer);

      expect(result.earlyResponse).toEqual({
        content: [
          {
            type: "text",
            text: "Action was declined.",
          },
        ],
      });
      expect(mockServer.server.elicitInput).toHaveBeenCalledTimes(2);
    });
  });
});
