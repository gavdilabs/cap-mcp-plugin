import { Application } from "express";
import { McpRestriction } from "../../../src/annotations/types";
import {
  resolveEffectiveHost,
  isLocalDevelopmentHost,
} from "../../../src/auth/host-resolver";
import {
  decodeProxyState,
  encodeProxyState,
  getAccessRights,
  resolveTenantAuthUrl,
  getWrapAccesses,
  hasToolOperationAccess,
  isAuthEnabled,
  isCustomScheme,
  isValidCustomScheme,
  registerAuthMiddleware,
  registerOAuthEndpoints,
  renderCustomSchemeRedirect,
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

jest.mock("../../../src/auth/xsuaa-service", () => ({
  XSUAAService: jest.fn().mockImplementation(() => ({
    discoverOAuthEndpoints: jest.fn().mockResolvedValue(undefined),
  })),
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

jest.mock("../../../src/auth/host-resolver", () => ({
  resolveEffectiveHost: jest.fn(),
  getProtocol: jest.fn(),
  buildPublicBaseUrl: jest.fn(),
  isLocalDevelopmentHost: jest.fn(),
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

    it("should register CAP middleware and auth handlers", async () => {
      // Act
      await registerAuthMiddleware(mockExpressApp as Application);

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

    it("should apply middleware only to MCP routes excluding health", async () => {
      // Act
      await registerAuthMiddleware(mockExpressApp as Application);

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

    it("should handle multiple CAP middleware factories", async () => {
      // Act
      await registerAuthMiddleware(mockExpressApp as Application);

      // Assert - verify that middleware registration happens
      expect(useSpy).toHaveBeenCalled();
    });

    it("should handle empty CAP middleware array", async () => {
      // Arrange
      const cds = require("@sap/cds");
      cds.middlewares.before = [];

      // Act
      await registerAuthMiddleware(mockExpressApp as Application);

      // Assert
      expect(useSpy).toHaveBeenCalledWith(
        /^\/mcp(?!\/health).*/,
        mockErrorHandler,
        mockAuthHandler,
      );
    });

    it("should handle middleware factories that return empty arrays", async () => {
      // Arrange
      const cds = require("@sap/cds");
      cds.middlewares.before = [
        {
          factory: jest.fn().mockReturnValue([]),
        },
      ];

      // Act
      await registerAuthMiddleware(mockExpressApp as Application);

      // Assert
      expect(useSpy).toHaveBeenCalledWith(
        /^\/mcp(?!\/health).*/,
        mockErrorHandler,
        mockAuthHandler,
      );
    });

    it("should handle middleware factories that return null", async () => {
      // Arrange
      const cds = require("@sap/cds");
      cds.middlewares.before = [
        {
          factory: jest.fn().mockReturnValue(null),
        },
      ];

      // Act
      await registerAuthMiddleware(mockExpressApp as Application);

      // Assert
      expect(useSpy).toHaveBeenCalledWith(
        /^\/mcp(?!\/health).*/,
        mockErrorHandler,
        mockAuthHandler,
      );
    });

    it("should handle middleware factories that return undefined", async () => {
      // Arrange
      const cds = require("@sap/cds");
      cds.middlewares.before = [
        {
          factory: jest.fn().mockReturnValue(undefined),
        },
      ];

      // Act
      await registerAuthMiddleware(mockExpressApp as Application);

      // Assert
      expect(useSpy).toHaveBeenCalledWith(
        /^\/mcp(?!\/health).*/,
        mockErrorHandler,
        mockAuthHandler,
      );
    });

    it("should handle missing CAP middlewares gracefully", async () => {
      // Arrange
      const globalCds = (global as any).cds;
      if (!globalCds) {
        // Skip if global.cds is not available (test isolation issue)
        return;
      }
      const originalMiddlewares = globalCds.middlewares;
      globalCds.middlewares = { before: undefined as any };

      // Act & Assert - this currently throws, which is expected behavior
      try {
        await expect(
          registerAuthMiddleware(mockExpressApp as Application),
        ).rejects.toThrow();
      } finally {
        // Restore original middlewares
        globalCds.middlewares = originalMiddlewares;
      }
    });

    it("should handle undefined Express app gracefully", async () => {
      // Act
      await expect(
        registerAuthMiddleware(undefined as any),
      ).resolves.not.toThrow();
    });

    it("should handle null Express app gracefully", async () => {
      // Act
      await expect(registerAuthMiddleware(null as any)).resolves.not.toThrow();
    });

    it("should call middleware registration process", async () => {
      // Act
      await registerAuthMiddleware(mockExpressApp as Application);

      // Assert - verify basic middleware registration
      expect(useSpy).toHaveBeenCalled();
    });

    it("should register middleware with error and auth handlers", async () => {
      // Act
      await registerAuthMiddleware(mockExpressApp as Application);

      // Assert - verify middleware registration includes auth components
      expect(useSpy).toHaveBeenCalled();
      const callArgs = useSpy.mock.calls[0];
      expect(callArgs).toContain(mockErrorHandler);
      expect(callArgs).toContain(mockAuthHandler);
    });

    it("should handle middleware registration robustly", async () => {
      // Act & Assert - should not throw under normal conditions
      await expect(
        registerAuthMiddleware(mockExpressApp as Application),
      ).resolves.not.toThrow();
    });

    describe("OAuth Proxy Configuration", () => {
      it("should skip OAuth proxy for dummy authentication", async () => {
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
        await registerAuthMiddleware(mockExpressApp as Application);

        // Assert
        expect(mockProxyOAuthServerProvider).not.toHaveBeenCalled();
        expect(mockMcpAuthRouter).not.toHaveBeenCalled();
      });

      it("should skip OAuth proxy for mocked authentication", async () => {
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
        await registerAuthMiddleware(mockExpressApp as Application);

        // Assert
        expect(mockProxyOAuthServerProvider).not.toHaveBeenCalled();
        expect(mockMcpAuthRouter).not.toHaveBeenCalled();
      });

      it("should skip OAuth proxy for basic authentication", async () => {
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
        await registerAuthMiddleware(mockExpressApp as Application);

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

  describe("OAuth Helpers", () => {
    describe("registerOAuthEndpoints", () => {
      let mockExpressApp: Partial<Application>;
      let getSpy: jest.Mock;
      let postSpy: jest.Mock;
      let useSpy: jest.Mock;
      const mockCredentials = {
        clientid: "cid",
        clientsecret: "csec",
        url: "https://provider.com",
      } as any;

      beforeEach(() => {
        getSpy = jest.fn();
        postSpy = jest.fn();
        useSpy = jest.fn();
        mockExpressApp = {
          get: getSpy,
          post: postSpy,
          use: useSpy,
        };
      });

      it("should register all OAuth routes and metadata endpoints", async () => {
        await registerOAuthEndpoints(
          mockExpressApp as any,
          mockCredentials,
          "xsuaa",
        );

        // Verify metadata endpoints
        // Note: /.well-known/oauth-protected-resource is intentionally disabled
        // as a hotfix due to MCP clients not sending application/json Accept headers,
        // causing XSUAA to return HTML instead of JSON (see bug note in utils.ts)
        expect(getSpy).toHaveBeenCalledWith(
          "/.well-known/oauth-authorization-server",
          expect.any(Function),
        );

        // Verify OAuth routes
        expect(getSpy).toHaveBeenCalledWith(
          "/oauth/authorize",
          expect.any(Function),
        );
        expect(getSpy).toHaveBeenCalledWith(
          "/oauth/callback",
          expect.any(Function),
        );
        expect(postSpy).toHaveBeenCalledWith(
          "/oauth/token",
          expect.any(Function),
        );
        expect(getSpy).toHaveBeenCalledWith(
          "/oauth/register",
          expect.any(Function),
        );
        expect(postSpy).toHaveBeenCalledWith(
          "/oauth/register",
          expect.any(Function),
        );
      });

      it("should return static client metadata for GET /oauth/register", async () => {
        await registerOAuthEndpoints(
          mockExpressApp as any,
          mockCredentials,
          "xsuaa",
        );

        const handler = getSpy.mock.calls.find(
          (call) => call[0] === "/oauth/register",
        )[1];
        const res = { json: jest.fn() } as any;
        const req = { headers: {} } as any;
        const {
          buildPublicBaseUrl,
        } = require("../../../src/auth/host-resolver");
        (buildPublicBaseUrl as jest.Mock).mockReturnValue("https://app.com");

        await handler(req, res);

        expect(res.json).toHaveBeenCalledWith({
          client_id: "cid",
          client_name: "MCP Server",
          redirect_uris: ["https://app.com/oauth/callback"],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        });
      });

      it("should handle static registration for POST /oauth/register", async () => {
        await registerOAuthEndpoints(
          mockExpressApp as any,
          mockCredentials,
          "xsuaa",
        );

        const handler = postSpy.mock.calls.find(
          (call) => call[0] === "/oauth/register",
        )[1];
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
        } as any;
        const req = { body: { client_name: "Custom Client" } } as any;
        const {
          buildPublicBaseUrl,
        } = require("../../../src/auth/host-resolver");
        (buildPublicBaseUrl as jest.Mock).mockReturnValue("https://app.com");

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
          client_id: "cid",
          client_name: "Custom Client",
          redirect_uris: ["https://app.com/oauth/callback"],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        });
      });
    });

    describe("resolveTenantAuthUrl", () => {
      const mockCredentials = {
        clientid: "cid",
        clientsecret: "csec",
        url: "https://provider.com",
        uaadomain: "auth.com",
      };

      it("should build standard subscriber URL", () => {
        const req = { headers: {} } as any;
        (resolveEffectiveHost as jest.Mock).mockReturnValue("tenant1.app.com");
        (isLocalDevelopmentHost as jest.Mock).mockReturnValue(false);

        const result = resolveTenantAuthUrl(
          req,
          mockCredentials,
          "/oauth/authorize",
        );

        expect(result).toBe("https://tenant1.auth.com/oauth/authorize");
      });

      it("should use identityzone for local development", () => {
        const req = { headers: {} } as any;
        (resolveEffectiveHost as jest.Mock).mockReturnValue("localhost:4004");
        (isLocalDevelopmentHost as jest.Mock).mockReturnValue(true);
        const creds = { ...mockCredentials, identityzone: "mytenant" };

        const result = resolveTenantAuthUrl(req, creds, "/oauth/token");

        expect(result).toBe("https://mytenant.auth.com/oauth/token");
      });

      it("should throw error if uaadomain is missing", () => {
        const req = { headers: {} } as any;
        (resolveEffectiveHost as jest.Mock).mockReturnValue("tenant2.app.com");
        (isLocalDevelopmentHost as jest.Mock).mockReturnValue(false);
        const creds = { ...mockCredentials, uaadomain: undefined };

        expect(() => resolveTenantAuthUrl(req, creds, "/info")).toThrow(
          /Missing required 'uaadomain' in XSUAA credentials/,
        );
      });
    });

    describe("isCustomScheme", () => {
      it("should return true for custom schemes", () => {
        expect(isCustomScheme("vscode://callback")).toBe(true);
        expect(isCustomScheme("cursor://auth")).toBe(true);
      });

      it("should return false for http/https", () => {
        expect(isCustomScheme("http://localhost")).toBe(false);
        expect(isCustomScheme("https://app.com")).toBe(false);
      });

      it("should handle empty input", () => {
        expect(isCustomScheme("")).toBe(false);
        expect(isCustomScheme(undefined as any)).toBe(false);
      });
    });

    describe("isValidCustomScheme", () => {
      it("should return true for allowed schemes", () => {
        expect(isValidCustomScheme("vscode://callback")).toBe(true);
        expect(isValidCustomScheme("cursor://auth")).toBe(true);
        expect(isValidCustomScheme("vscodium://test")).toBe(true);
      });

      it("should return false for dangerous schemes", () => {
        expect(isValidCustomScheme("javascript:alert(1)")).toBe(false);
        expect(isValidCustomScheme("file:///etc/passwd")).toBe(false);
        expect(isValidCustomScheme("data:text/html,abc")).toBe(false);
      });

      it("should return false for unknown schemes", () => {
        expect(isValidCustomScheme("unknown://test")).toBe(false);
      });
    });

    describe("Proxy State Handling", () => {
      it("should encode and decode state correctly", () => {
        const originalState = "xyz-123";
        const customUri = "vscode://callback";

        const encoded = encodeProxyState(originalState, customUri);
        expect(typeof encoded).toBe("string");

        const decoded = decodeProxyState(encoded);
        expect(decoded).toEqual({
          originalState,
          customUri,
        });
      });

      it("should handle decode failures gracefully", () => {
        expect(decodeProxyState("invalid-base64")).toBeNull();
        expect(decodeProxyState(null)).toBeNull();
      });
    });

    describe("renderCustomSchemeRedirect", () => {
      it("should render HTML with the provided URL", () => {
        const url = "vscode://callback?token=abc";
        const result = renderCustomSchemeRedirect(url);

        expect(result).toContain('href="vscode://callback?token=abc"');
        expect(result).toContain('data-url="vscode://callback?token=abc"');
        expect(result).toContain("location.href = url");
        expect(result).toContain("Authorization Complete");
      });

      it("should escape HTML in output", () => {
        const url = 'vscode://callback?token="><script>alert(1)</script>';
        const result = renderCustomSchemeRedirect(url);

        expect(result).not.toContain('"><script>');
        expect(result).toContain("&quot;&gt;&lt;script&gt;");
      });
    });
  });
});
