import { createMcpServer } from "../../../src/mcp/factory";
import {
  McpResourceAnnotation,
  McpToolAnnotation,
  McpPromptAnnotation,
} from "../../../src/annotations/structures";
import {
  AnnotatedMcpEntry,
  ParsedAnnotations,
} from "../../../src/annotations/types";
import { CAPConfiguration } from "../../../src/config/types";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { assignToolToServer } from "../../../src/mcp/tools";
import { assignResourceToServer } from "../../../src/mcp/resources";
import { assignPromptToServer } from "../../../src/mcp/prompts";
import { LOGGER } from "../../../src/logger";
import {
  createTestConfig,
  mockCdsEnvironment,
} from "../../helpers/mock-config";

// Mock dependencies
jest.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: jest.fn().mockImplementation((config) => ({
    name: config.name,
    version: config.version,
    capabilities: config.capabilities,
    registerTool: jest.fn(),
    registerResource: jest.fn(),
    registerPrompt: jest.fn(),
  })),
}));

jest.mock("../../../src/mcp/tools", () => ({
  assignToolToServer: jest.fn(),
}));

jest.mock("../../../src/mcp/resources", () => ({
  assignResourceToServer: jest.fn(),
}));

jest.mock("../../../src/mcp/prompts", () => ({
  assignPromptToServer: jest.fn(),
}));

jest.mock("../../../src/logger", () => ({
  LOGGER: {
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("../../../src/auth/utils", () => ({
  isAuthEnabled: jest.fn(() => false),
  getAccessRights: jest.fn(() => ({ is: () => true })),
  hasToolOperationAccess: jest.fn(() => true),
  getWrapAccesses: jest.fn(() => ({
    canRead: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
  })),
}));

jest.mock("../../../src/mcp/entity-tools", () => ({
  registerEntityWrappers: jest.fn(),
}));

describe("Factory", () => {
  let mockConfig: CAPConfiguration;

  beforeEach(() => {
    // Mock CDS environment for tests
    mockCdsEnvironment();

    // Create test configuration with auth disabled
    mockConfig = createTestConfig({
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    });

    jest.clearAllMocks();
  });

  describe("createMcpServer", () => {
    test("should create server without annotations", () => {
      const server = createMcpServer(mockConfig);

      expect(McpServer).toHaveBeenCalledWith(
        {
          name: "Test Server",
          version: "1.0.0",
          capabilities: mockConfig.capabilities,
        },
        { instructions: mockConfig.instructions },
      );
      expect(server).toBeDefined();
      expect(LOGGER.debug).toHaveBeenCalledWith("Creating MCP server instance");
    });

    test("should create server with undefined annotations", () => {
      const server = createMcpServer(mockConfig, undefined);

      expect(McpServer).toHaveBeenCalled();
      expect(server).toBeDefined();
      expect(assignToolToServer).not.toHaveBeenCalled();
      expect(assignResourceToServer).not.toHaveBeenCalled();
      expect(assignPromptToServer).not.toHaveBeenCalled();
    });

    test("should create server and assign tool annotations", () => {
      const toolAnnotation = new McpToolAnnotation(
        "test-tool",
        "Test tool description",
        "test-operation",
        "TestService",
      );

      const annotations: ParsedAnnotations = new Map([
        ["test-tool", toolAnnotation],
      ]);

      const server = createMcpServer(mockConfig, annotations);

      expect(McpServer).toHaveBeenCalled();
      expect(assignToolToServer).toHaveBeenCalledWith(
        toolAnnotation,
        expect.any(Object),
        false, // authEnabled should be false for test config
      );
      expect(LOGGER.debug).toHaveBeenCalledWith(
        "Annotations found for server: ",
        annotations,
      );
    });

    test("should create server and assign resource annotations", () => {
      const resourceAnnotation = new McpResourceAnnotation(
        "test-resource",
        "Test resource description",
        "test-target",
        "TestService",
        new Set(["filter"]),
        new Map([["id", "UUID"]]),
        new Map([["id", "UUID"]]),
      );

      const annotations: ParsedAnnotations = new Map([
        ["test-resource", resourceAnnotation],
      ]);

      createMcpServer(mockConfig, annotations);

      expect(assignResourceToServer).toHaveBeenCalledWith(
        resourceAnnotation,
        expect.any(Object),
        false, // authEnabled should be false for test config
      );
    });

    test("should create server and assign prompt annotations", () => {
      const promptAnnotation = new McpPromptAnnotation(
        "test-prompt",
        "Test prompt description",
        "TestService",
        [
          {
            name: "test",
            title: "Test",
            description: "Test",
            template: "Test {{input}}",
            role: "user",
            inputs: [{ key: "input", type: "String" }],
          },
        ],
      );

      const annotations: ParsedAnnotations = new Map([
        ["test-prompt", promptAnnotation],
      ]);

      createMcpServer(mockConfig, annotations);

      expect(assignPromptToServer).toHaveBeenCalledWith(
        promptAnnotation,
        expect.any(Object),
      );
    });

    test("should handle mixed annotation types", () => {
      const toolAnnotation = new McpToolAnnotation(
        "tool",
        "desc",
        "op",
        "service",
      );
      const resourceAnnotation = new McpResourceAnnotation(
        "resource",
        "desc",
        "target",
        "service",
        new Set(),
        new Map(),
        new Map(),
      );
      const promptAnnotation = new McpPromptAnnotation(
        "prompt",
        "desc",
        "service",
        [
          {
            name: "p",
            title: "t",
            description: "d",
            template: "tmp",
            role: "user",
          },
        ],
      );

      const annotations: ParsedAnnotations = new Map([
        ["tool", toolAnnotation as AnnotatedMcpEntry],
        ["resource", resourceAnnotation],
        ["prompt", promptAnnotation],
      ]);

      createMcpServer(mockConfig, annotations);

      expect(assignToolToServer).toHaveBeenCalledWith(
        toolAnnotation,
        expect.any(Object),
        false, // authEnabled should be false for test config
      );
      expect(assignResourceToServer).toHaveBeenCalledWith(
        resourceAnnotation,
        expect.any(Object),
        false, // authEnabled should be false for test config
      );
      expect(assignPromptToServer).toHaveBeenCalledWith(
        promptAnnotation,
        expect.any(Object),
      );
    });

    test("should warn about invalid annotation entries", () => {
      // Create a mock annotation that doesn't match any known constructor
      const invalidAnnotation = { name: "invalid", constructor: Object };
      const annotations: ParsedAnnotations = new Map([
        ["invalid", invalidAnnotation as any],
      ]);

      createMcpServer(mockConfig, annotations);

      expect(LOGGER.warn).toHaveBeenCalledWith(
        "Invalid annotation entry - Cannot be parsed by MCP server, skipping...",
      );
    });

    test("should handle empty annotations map", () => {
      const annotations: ParsedAnnotations = new Map();

      createMcpServer(mockConfig, annotations);

      expect(assignToolToServer).not.toHaveBeenCalled();
      expect(assignResourceToServer).not.toHaveBeenCalled();
      expect(assignPromptToServer).not.toHaveBeenCalled();
    });

    test("should handle all annotation types in single call", () => {
      const toolAnnotation = new McpToolAnnotation(
        "tool1",
        "desc1",
        "op1",
        "service1",
      );
      const resourceAnnotation = new McpResourceAnnotation(
        "resource1",
        "desc2",
        "target1",
        "service2",
        new Set(["filter"]),
        new Map(),
        new Map(),
      );
      const promptAnnotation = new McpPromptAnnotation(
        "prompt1",
        "desc3",
        "service3",
        [
          {
            name: "p1",
            title: "t1",
            description: "d1",
            template: "tmp1",
            role: "assistant",
          },
        ],
      );

      const annotations: ParsedAnnotations = new Map([
        ["tool1", toolAnnotation as AnnotatedMcpEntry],
        ["resource1", resourceAnnotation],
        ["prompt1", promptAnnotation],
      ]);

      createMcpServer(mockConfig, annotations);

      expect(assignToolToServer).toHaveBeenCalledTimes(1);
      expect(assignResourceToServer).toHaveBeenCalledTimes(1);
      expect(assignPromptToServer).toHaveBeenCalledTimes(1);
    });

    test("should handle multiple annotations of same type", () => {
      const tool1 = new McpToolAnnotation("tool1", "desc1", "op1", "service1");
      const tool2 = new McpToolAnnotation("tool2", "desc2", "op2", "service2");

      const annotations: ParsedAnnotations = new Map([
        ["tool1", tool1],
        ["tool2", tool2],
      ]);

      createMcpServer(mockConfig, annotations);

      expect(assignToolToServer).toHaveBeenCalledTimes(2);
      expect(assignToolToServer).toHaveBeenNthCalledWith(
        1,
        tool1,
        expect.any(Object),
        false, // authEnabled should be false for test config
      );
      expect(assignToolToServer).toHaveBeenNthCalledWith(
        2,
        tool2,
        expect.any(Object),
        false, // authEnabled should be false for test config
      );
    });
  });
});
