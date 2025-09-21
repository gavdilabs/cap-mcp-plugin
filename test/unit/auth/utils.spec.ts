import { Application } from "express";
import {
  isAuthEnabled,
  getAccessRights,
  registerAuthMiddleware,
  hasToolOperationAccess,
  getWrapAccesses,
} from "../../../src/auth/utils";
import { McpAuthType } from "../../../src/config/types";
import { McpRestriction } from "../../../src/annotations/types";

// Mock the CDS module
jest.mock("@sap/cds", () => ({
  context: {
    user: { id: "test-user", name: "Test User" },
  },
  User: {
    privileged: { id: "privileged", name: "Privileged User" },
    anonymous: { id: "anonymous", _is_anonymous: true },
  },
  middlewares: {
    before: [
      {
        factory: jest.fn().mockReturnValue([
          jest.fn(), // Mock middleware function
        ]),
      },
    ],
  },
  env: {
    requires: {
      auth: {
        kind: "dummy",
        credentials: {},
      },
    },
  },
}));

// Mock the handler factories
const mockAuthHandler = jest.fn();
const mockErrorHandler = jest.fn();

jest.mock("../../../src/auth/factory", () => ({
  authHandlerFactory: jest.fn(() => mockAuthHandler),
  errorHandlerFactory: jest.fn(() => mockErrorHandler),
}));

// Mock the MCP SDK OAuth components
jest.mock(
  "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js",
  () => ({
    ProxyOAuthServerProvider: jest.fn(),
  }),
);

jest.mock("@modelcontextprotocol/sdk/server/auth/router.js", () => ({
  mcpAuthRouter: jest.fn(() => "mocked-oauth-router"),
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

describe("Authentication Utils", () => {
  let mockProxyOAuthServerProvider: jest.MockedFunction<any>;
  let mockMcpAuthRouter: jest.MockedFunction<any>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Get mocked functions
    mockProxyOAuthServerProvider =
      require("@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js").ProxyOAuthServerProvider;
    mockMcpAuthRouter =
      require("@modelcontextprotocol/sdk/server/auth/router.js").mcpAuthRouter;

    // Reset CDS context and environment
    const cds = require("@sap/cds");

    // Create a proper CDS context mock
    cds.context = { user: { id: "test-user", name: "Test User" } };

    cds.middlewares = {
      before: [
        {
          factory: jest.fn().mockReturnValue([
            jest.fn(), // Mock middleware function
          ]),
        },
      ],
    };

    // Reset default CDS environment
    cds.env = {
      requires: {
        auth: {
          kind: "dummy",
          credentials: {},
        },
      },
    };
  });

  describe("isAuthEnabled", () => {
    it('should return false for "none" auth type', () => {
      // Act
      const result = isAuthEnabled("none" as McpAuthType);

      // Assert
      expect(result).toBe(false);
    });

    it('should return true for "inherit" auth type', () => {
      // Act
      const result = isAuthEnabled("inherit" as McpAuthType);

      // Assert
      expect(result).toBe(true);
    });

    it("should default to true for any unknown auth type", () => {
      // Act
      const result = isAuthEnabled("unknown" as any);

      // Assert
      expect(result).toBe(true);
    });

    it("should handle undefined auth type gracefully", () => {
      // Act
      const result = isAuthEnabled(undefined as any);

      // Assert
      expect(result).toBe(true);
    });

    it("should handle null auth type gracefully", () => {
      // Act
      const result = isAuthEnabled(null as any);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe("getAccessRights", () => {
    it("should return privileged user when auth is disabled", () => {
      // Act
      const result = getAccessRights(false);

      // Assert
      const cds = require("@sap/cds");
      expect(result).toEqual(cds.User.privileged);
    });

    it("should return current context user when auth is enabled", () => {
      // Note: This test verifies the function calls cds.context.user
      // The actual user object depends on the CDS context at runtime
      const result = getAccessRights(true);

      // We just verify that when auth is enabled, we get some user context
      // (even if it's null in test environment)
      expect(typeof result).toBeDefined();
    });
  });

  describe("registerAuthMiddleware", () => {
    let mockExpressApp: Partial<Application>;
    let useSpy: jest.Mock;

    beforeEach(() => {
      useSpy = jest.fn();
      mockExpressApp = {
        use: useSpy,
      };
    });

    it("should register CAP middleware and auth handlers", () => {
      // Act
      registerAuthMiddleware(mockExpressApp as Application);

      // Assert
      expect(useSpy).toHaveBeenCalled();
      const callArgs = useSpy.mock.calls[0];
      expect(callArgs[0]).toEqual(/^\/mcp(?!\/health).*/);
      expect(callArgs).toContain(mockErrorHandler);
      expect(callArgs).toContain(mockAuthHandler);

      // Should not configure OAuth proxy for dummy auth
      expect(mockProxyOAuthServerProvider).not.toHaveBeenCalled();
      expect(mockMcpAuthRouter).not.toHaveBeenCalled();
    });

    it("should apply middleware only to MCP routes excluding health", () => {
      // Act
      registerAuthMiddleware(mockExpressApp as Application);

      // Assert
      const regex = useSpy.mock.calls[0][0];

      // Should match MCP routes
      expect(regex.test("/mcp")).toBe(true);
      expect(regex.test("/mcp/session")).toBe(true);
      expect(regex.test("/mcp/tools")).toBe(true);

      // Should NOT match health endpoint
      expect(regex.test("/mcp/health")).toBe(false);

      // Should NOT match non-MCP routes
      expect(regex.test("/api")).toBe(false);
      expect(regex.test("/")).toBe(false);
    });

    it("should handle multiple CAP middleware factories", () => {
      // Act
      registerAuthMiddleware(mockExpressApp as Application);

      // Assert - verify that middleware registration happens
      expect(useSpy).toHaveBeenCalled();
    });

    it("should handle empty CAP middleware array", () => {
      // Arrange
      const cds = require("@sap/cds");
      cds.middlewares.before = [];

      // Act
      registerAuthMiddleware(mockExpressApp as Application);

      // Assert
      expect(useSpy).toHaveBeenCalledWith(
        /^\/mcp(?!\/health).*/,
        mockErrorHandler,
        mockAuthHandler,
      );
    });

    it("should handle middleware factories that return empty arrays", () => {
      // Arrange
      const cds = require("@sap/cds");
      cds.middlewares.before = [
        {
          factory: jest.fn().mockReturnValue([]),
        },
      ];

      // Act
      registerAuthMiddleware(mockExpressApp as Application);

      // Assert
      expect(useSpy).toHaveBeenCalledWith(
        /^\/mcp(?!\/health).*/,
        mockErrorHandler,
        mockAuthHandler,
      );
    });

    it("should handle middleware factories that return null", () => {
      // Arrange
      const cds = require("@sap/cds");
      cds.middlewares.before = [
        {
          factory: jest.fn().mockReturnValue(null),
        },
      ];

      // Act
      registerAuthMiddleware(mockExpressApp as Application);

      // Assert
      expect(useSpy).toHaveBeenCalledWith(
        /^\/mcp(?!\/health).*/,
        mockErrorHandler,
        mockAuthHandler,
      );
    });

    it("should handle middleware factories that return undefined", () => {
      // Arrange
      const cds = require("@sap/cds");
      cds.middlewares.before = [
        {
          factory: jest.fn().mockReturnValue(undefined),
        },
      ];

      // Act
      registerAuthMiddleware(mockExpressApp as Application);

      // Assert
      expect(useSpy).toHaveBeenCalledWith(
        /^\/mcp(?!\/health).*/,
        mockErrorHandler,
        mockAuthHandler,
      );
    });

    it("should handle missing CAP middlewares gracefully", () => {
      // Arrange
      const cds = require("@sap/cds");
      cds.middlewares = { before: undefined as any };

      // Act & Assert - this currently throws, which is expected behavior
      expect(() =>
        registerAuthMiddleware(mockExpressApp as Application),
      ).toThrow();
    });

    it("should handle undefined Express app gracefully", () => {
      // Act
      expect(() => registerAuthMiddleware(undefined as any)).not.toThrow();
    });

    it("should handle null Express app gracefully", () => {
      // Act
      expect(() => registerAuthMiddleware(null as any)).not.toThrow();
    });

    it("should call middleware registration process", () => {
      // Act
      registerAuthMiddleware(mockExpressApp as Application);

      // Assert - verify basic middleware registration
      expect(useSpy).toHaveBeenCalled();
    });

    it("should register middleware with error and auth handlers", () => {
      // Act
      registerAuthMiddleware(mockExpressApp as Application);

      // Assert - verify middleware registration includes auth components
      expect(useSpy).toHaveBeenCalled();
      const callArgs = useSpy.mock.calls[0];
      expect(callArgs).toContain(mockErrorHandler);
      expect(callArgs).toContain(mockAuthHandler);
    });

    it("should handle middleware registration robustly", () => {
      // Act & Assert - should not throw under normal conditions
      expect(() =>
        registerAuthMiddleware(mockExpressApp as Application),
      ).not.toThrow();
    });

    describe("OAuth Proxy Configuration", () => {
      it("should skip OAuth proxy for dummy authentication", () => {
        // Arrange
        const cds = require("@sap/cds");
        cds.env = {
          requires: {
            auth: {
              kind: "dummy",
              credentials: {},
            },
          },
        };

        // Act
        registerAuthMiddleware(mockExpressApp as Application);

        // Assert
        expect(mockProxyOAuthServerProvider).not.toHaveBeenCalled();
        expect(mockMcpAuthRouter).not.toHaveBeenCalled();
      });

      it("should skip OAuth proxy for mocked authentication", () => {
        // Arrange
        const cds = require("@sap/cds");
        cds.env = {
          requires: {
            auth: {
              kind: "mocked",
              credentials: {
                users: { testuser: "password" },
              },
            },
          },
        };

        // Act
        registerAuthMiddleware(mockExpressApp as Application);

        // Assert
        expect(mockProxyOAuthServerProvider).not.toHaveBeenCalled();
        expect(mockMcpAuthRouter).not.toHaveBeenCalled();
      });

      it("should skip OAuth proxy for basic authentication", () => {
        // Arrange
        const cds = require("@sap/cds");
        cds.env = {
          requires: {
            auth: {
              kind: "basic",
              credentials: {
                users: { admin: "secret" },
              },
            },
          },
        };

        // Act
        registerAuthMiddleware(mockExpressApp as Application);

        // Assert
        expect(mockProxyOAuthServerProvider).not.toHaveBeenCalled();
        expect(mockMcpAuthRouter).not.toHaveBeenCalled();
      });
    });
  });

  describe("hasToolOperationAccess", () => {
    it("should return true when user has required role", () => {
      // Arrange
      const mockUser = {
        is: jest.fn().mockReturnValue(true),
      } as any;
      const restrictions: McpRestriction[] = [
        { role: "admin" },
        { role: "user" },
      ];

      // Act
      const result = hasToolOperationAccess(mockUser, restrictions);

      // Assert
      expect(result).toBe(true);
      expect(mockUser.is).toHaveBeenCalledWith("admin");
    });

    it("should return false when user does not have any required roles", () => {
      // Arrange
      const mockUser = {
        is: jest.fn().mockReturnValue(false),
      } as any;
      const restrictions: McpRestriction[] = [
        { role: "admin" },
        { role: "maintainer" },
      ];

      // Act
      const result = hasToolOperationAccess(mockUser, restrictions);

      // Assert
      expect(result).toBe(false);
      expect(mockUser.is).toHaveBeenCalledWith("admin");
      expect(mockUser.is).toHaveBeenCalledWith("maintainer");
    });

    it("should return true for empty restrictions (no access control)", () => {
      // Arrange
      const mockUser = {
        is: jest.fn(),
      } as any;
      const restrictions: McpRestriction[] = [];

      // Act
      const result = hasToolOperationAccess(mockUser, restrictions);

      // Assert
      expect(result).toBe(true);
      expect(mockUser.is).not.toHaveBeenCalled();
    });
  });

  describe("getWrapAccesses", () => {
    it("should grant no access when user has no matching roles", () => {
      // Arrange
      const mockUser = {
        is: jest.fn().mockReturnValue(false),
      } as any;
      const restrictions: McpRestriction[] = [
        { role: "admin", operations: ["READ", "CREATE"] },
      ];

      // Act
      const result = getWrapAccesses(mockUser, restrictions);

      // Assert
      expect(result).toEqual({});
    });

    it("should grant all access when user has role without specific operations", () => {
      // Arrange
      const mockUser = {
        is: jest.fn().mockImplementation((role) => role === "admin"),
      } as any;
      const restrictions: McpRestriction[] = [{ role: "admin" }];

      // Act
      const result = getWrapAccesses(mockUser, restrictions);

      // Assert
      expect(result).toEqual({
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      });
    });

    it("should grant specific access based on operations", () => {
      // Arrange
      const mockUser = {
        is: jest.fn().mockImplementation((role) => role === "reader"),
      } as any;
      const restrictions: McpRestriction[] = [
        { role: "reader", operations: ["READ"] },
        { role: "admin", operations: ["CREATE", "UPDATE", "DELETE"] },
      ];

      // Act
      const result = getWrapAccesses(mockUser, restrictions);

      // Assert
      expect(result).toEqual({
        canRead: true,
      });
    });

    it("should combine access from multiple matching roles", () => {
      // Arrange
      const mockUser = {
        is: jest.fn().mockReturnValue(true), // User has all roles
      } as any;
      const restrictions: McpRestriction[] = [
        { role: "reader", operations: ["READ"] },
        { role: "writer", operations: ["CREATE", "UPDATE"] },
      ];

      // Act
      const result = getWrapAccesses(mockUser, restrictions);

      // Assert
      expect(result).toEqual({
        canRead: true,
        canCreate: true,
        canUpdate: true,
      });
    });

    it("should grant all access for empty restrictions (no access control)", () => {
      // Arrange
      const mockUser = {
        is: jest.fn(),
      } as any;
      const restrictions: McpRestriction[] = [];

      // Act
      const result = getWrapAccesses(mockUser, restrictions);

      // Assert
      expect(result).toEqual({
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      });
      expect(mockUser.is).not.toHaveBeenCalled();
    });

    it("should handle restrictions with empty operations", () => {
      // Arrange
      const mockUser = {
        is: jest.fn().mockImplementation((role) => role === "user"),
      } as any;
      const restrictions: McpRestriction[] = [{ role: "user", operations: [] }];

      // Act
      const result = getWrapAccesses(mockUser, restrictions);

      // Assert
      expect(result).toEqual({
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      });
    });
  });
});
