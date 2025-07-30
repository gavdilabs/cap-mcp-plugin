import { Application } from "express";
import {
  isAuthEnabled,
  getAccessRights,
  registerAuthMiddleware,
} from "../../../src/auth/utils";
import { McpAuthType } from "../../../src/config/types";

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
}));

// Mock the handler factories
const mockAuthHandler = jest.fn();
const mockErrorHandler = jest.fn();

jest.mock("../../../src/auth/handler", () => ({
  authHandlerFactory: jest.fn(() => mockAuthHandler),
  errorHandlerFactory: jest.fn(() => mockErrorHandler),
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
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset CDS context
    const cds = require("@sap/cds");
    cds.context.user = { id: "test-user", name: "Test User" };
    cds.middlewares.before = [
      {
        factory: jest.fn().mockReturnValue([
          jest.fn(), // Mock middleware function
        ]),
      },
    ];
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
    it("should return CDS context user when auth is enabled", () => {
      // Arrange
      const expectedUser = { id: "test-user", name: "Test User" };
      const cds = require("@sap/cds");
      cds.context.user = expectedUser;

      // Act
      const result = getAccessRights(true);

      // Assert
      expect(result).toBe(expectedUser);
    });

    it("should return privileged user when auth is disabled", () => {
      // Act
      const result = getAccessRights(false);

      // Assert
      const cds = require("@sap/cds");
      expect(result).toBe(cds.User.privileged);
    });

    it("should return CDS context user even if null when auth is enabled", () => {
      // Arrange
      const cds = require("@sap/cds");
      cds.context.user = null;

      // Act
      const result = getAccessRights(true);

      // Assert
      expect(result).toBe(null);
    });

    it("should return CDS context user even if undefined when auth is enabled", () => {
      // Arrange
      const cds = require("@sap/cds");
      cds.context.user = undefined as any;

      // Act
      const result = getAccessRights(true);

      // Assert
      expect(result).toBe(undefined);
    });

    it("should always return privileged user when auth is disabled regardless of context", () => {
      // Arrange
      const cds = require("@sap/cds");
      cds.context.user = null;

      // Act
      const result = getAccessRights(false);

      // Assert
      expect(result).toBe(cds.User.privileged);
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
      expect(useSpy).toHaveBeenCalledWith(
        /^\/mcp(?!\/health).*/,
        [expect.any(Function)], // CAP middleware array
        mockErrorHandler,
        mockAuthHandler,
      );
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
      // Arrange
      const mockMiddleware1 = jest.fn();
      const mockMiddleware2 = jest.fn();
      const cds = require("@sap/cds");
      cds.middlewares.before = [
        {
          factory: jest.fn().mockReturnValue([mockMiddleware1]),
        },
        {
          factory: jest.fn().mockReturnValue([mockMiddleware2]),
        },
      ];

      // Act
      registerAuthMiddleware(mockExpressApp as Application);

      // Assert
      expect(useSpy).toHaveBeenCalledWith(
        /^\/mcp(?!\/health).*/,
        [mockMiddleware1],
        [mockMiddleware2],
        mockErrorHandler,
        mockAuthHandler,
      );
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
      cds.middlewares.before = undefined as any;

      // Act
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

    it("should call CAP middleware factories during registration", () => {
      // Arrange
      const factorySpy = jest.fn().mockReturnValue([jest.fn()]);
      const cds = require("@sap/cds");
      cds.middlewares.before = [{ factory: factorySpy }];

      // Act
      registerAuthMiddleware(mockExpressApp as Application);

      // Assert
      expect(factorySpy).toHaveBeenCalled();
    });

    it("should maintain middleware execution order", () => {
      // Arrange
      const mockMiddleware1 = jest.fn();
      const mockMiddleware2 = jest.fn();
      const cds = require("@sap/cds");
      cds.middlewares.before = [
        {
          factory: jest.fn().mockReturnValue([mockMiddleware1]),
        },
        {
          factory: jest.fn().mockReturnValue([mockMiddleware2]),
        },
      ];

      // Act
      registerAuthMiddleware(mockExpressApp as Application);

      // Assert
      const registeredMiddleware = useSpy.mock.calls[0].slice(1); // Remove regex, get middleware
      expect(registeredMiddleware).toEqual([
        [mockMiddleware1],
        [mockMiddleware2],
        mockErrorHandler,
        mockAuthHandler,
      ]);
    });

    it("should handle middleware factories throwing errors", () => {
      // Arrange
      const cds = require("@sap/cds");
      cds.middlewares.before = [
        {
          factory: jest.fn().mockImplementation(() => {
            throw new Error("Middleware factory error");
          }),
        },
      ];

      // Act & Assert
      expect(() =>
        registerAuthMiddleware(mockExpressApp as Application),
      ).toThrow("Middleware factory error");
    });
  });
});
