import { createMcpServer } from "../../../src/mcp/factory";
import { CAPConfiguration } from "../../../src/config/types";
import { getMcpInstructions } from "../../../src/config/instructions";
import { utils } from "@sap/cds";

// Mock the MCP SDK
const mockMcpServer = {
  serverInfo: {},
  serverOptions: {},
  setRequestHandler: jest.fn(),
  registerTool: jest.fn(),
  registerResource: jest.fn(),
  registerPrompt: jest.fn(),
};

jest.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: jest.fn().mockImplementation((serverInfo, serverOptions) => {
    mockMcpServer.serverInfo = serverInfo;
    mockMcpServer.serverOptions = serverOptions;
    return mockMcpServer;
  }),
}));

// Mock the instructions module
jest.mock("../../../src/config/instructions", () => ({
  getMcpInstructions: jest.fn(),
}));

// Mock @sap/cds utils
jest.mock("@sap/cds", () => ({
  utils: {
    fs: {
      existsSync: jest.fn(),
      readFileSync: jest.fn(),
    },
  },
  User: {
    privileged: { id: "test-user", roles: [] },
  },
  context: {
    user: { id: "context-user", roles: [] },
  },
}));

// Mock the logger
jest.mock("../../../src/logger", () => ({
  LOGGER: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Import the mocked class
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const mockGetMcpInstructions = getMcpInstructions as jest.MockedFunction<
  typeof getMcpInstructions
>;

describe("MCP Factory Instructions Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the mock server state
    mockMcpServer.serverInfo = {};
    mockMcpServer.serverOptions = {};
    mockMcpServer.registerTool.mockClear();
    mockMcpServer.registerResource.mockClear();
    mockMcpServer.registerPrompt.mockClear();
  });

  const baseConfig: CAPConfiguration = {
    name: "test-server",
    version: "1.0.0",
    auth: "none",
    capabilities: {
      tools: { listChanged: true },
      resources: { listChanged: true, subscribe: false },
      prompts: { listChanged: true },
    },
  };

  describe("createMcpServer with string instructions", () => {
    it("should pass string instructions to MCP server", () => {
      const instructionText = "These are test instructions";
      const config = { ...baseConfig, instructions: instructionText };

      mockGetMcpInstructions.mockReturnValue(instructionText);

      const server = createMcpServer(config);

      expect(mockGetMcpInstructions).toHaveBeenCalledWith(config);
      expect(McpServer).toHaveBeenCalledWith(
        {
          name: config.name,
          version: config.version,
          capabilities: config.capabilities,
        },
        { instructions: instructionText },
      );
      expect((server as any).serverOptions.instructions).toBe(instructionText);
    });
  });

  describe("createMcpServer with file-based instructions", () => {
    it("should pass loaded file instructions to MCP server", () => {
      const filePath = "./test-instructions.md";
      const fileContent = "# Test Instructions\n\nThese are from a file.";
      const config = { ...baseConfig, instructions: { file: filePath } };

      mockGetMcpInstructions.mockReturnValue(fileContent);

      const server = createMcpServer(config);

      expect(mockGetMcpInstructions).toHaveBeenCalledWith(config);
      expect(McpServer).toHaveBeenCalledWith(
        {
          name: config.name,
          version: config.version,
          capabilities: config.capabilities,
        },
        { instructions: fileContent },
      );
      expect((server as any).serverOptions.instructions).toBe(fileContent);
    });

    it("should handle file loading errors gracefully", () => {
      const config = {
        ...baseConfig,
        instructions: { file: "nonexistent.md" },
      };

      // Mock getMcpInstructions to throw an error (simulating file not found)
      mockGetMcpInstructions.mockImplementation(() => {
        throw new Error("Instructions file not found");
      });

      expect(() => createMcpServer(config)).toThrow(
        "Instructions file not found",
      );
      expect(mockGetMcpInstructions).toHaveBeenCalledWith(config);
    });
  });

  describe("createMcpServer with no instructions", () => {
    it("should handle undefined instructions", () => {
      const config = { ...baseConfig };

      mockGetMcpInstructions.mockReturnValue(undefined);

      const server = createMcpServer(config);

      expect(mockGetMcpInstructions).toHaveBeenCalledWith(config);
      expect(McpServer).toHaveBeenCalledWith(
        {
          name: config.name,
          version: config.version,
          capabilities: config.capabilities,
        },
        { instructions: undefined },
      );
      expect((server as any).serverOptions.instructions).toBeUndefined();
    });

    it("should handle null instructions", () => {
      const config = {
        ...baseConfig,
        instructions: null,
      } as unknown as CAPConfiguration;

      mockGetMcpInstructions.mockReturnValue(undefined);

      const server = createMcpServer(config);

      expect(mockGetMcpInstructions).toHaveBeenCalledWith(config);
      expect(McpServer).toHaveBeenCalledWith(
        {
          name: config.name,
          version: config.version,
          capabilities: config.capabilities,
        },
        { instructions: undefined },
      );
      expect((server as any).serverOptions.instructions).toBeUndefined();
    });

    it("should handle empty object instructions", () => {
      const config = { ...baseConfig, instructions: {} };

      mockGetMcpInstructions.mockReturnValue(undefined);

      const server = createMcpServer(config);

      expect(mockGetMcpInstructions).toHaveBeenCalledWith(config);
      expect((server as any).serverOptions.instructions).toBeUndefined();
    });
  });

  describe("createMcpServer instructions integration", () => {
    it("should properly integrate with existing server creation logic", () => {
      const instructionText = "Integration test instructions";
      const config = { ...baseConfig, instructions: instructionText };

      mockGetMcpInstructions.mockReturnValue(instructionText);

      const server = createMcpServer(config);

      // Verify server info is correct
      expect((server as any).serverInfo.name).toBe(config.name);
      expect((server as any).serverInfo.version).toBe(config.version);
      expect((server as any).serverInfo.capabilities).toEqual(
        config.capabilities,
      );

      // Verify instructions are passed correctly
      expect((server as any).serverOptions.instructions).toBe(instructionText);
    });

    it("should work with annotations parameter", () => {
      const instructionText = "Test with annotations";
      const config = { ...baseConfig, instructions: instructionText };
      const mockAnnotations = new Map(); // Empty annotations for test

      mockGetMcpInstructions.mockReturnValue(instructionText);

      const server = createMcpServer(config, mockAnnotations);

      expect(mockGetMcpInstructions).toHaveBeenCalledWith(config);
      expect((server as any).serverOptions.instructions).toBe(instructionText);
    });

    it("should work without annotations parameter", () => {
      const instructionText = "Test without annotations";
      const config = { ...baseConfig, instructions: instructionText };

      mockGetMcpInstructions.mockReturnValue(instructionText);

      const server = createMcpServer(config);

      expect(mockGetMcpInstructions).toHaveBeenCalledWith(config);
      expect((server as any).serverOptions.instructions).toBe(instructionText);
    });
  });
});
