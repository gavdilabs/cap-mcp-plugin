import { Request, Response } from "express";
import { handleTokenRequest } from "../../../src/auth/handlers";
import { XSUAAService } from "../../../src/auth/xsuaa-service";

// Mock the logger
jest.mock("../../../src/logger", () => ({
  LOGGER: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock XSUAAService - extending the global mock with specific methods for this test
jest.mock("../../../src/auth/xsuaa-service", () => ({
  XSUAAService: jest.fn().mockImplementation(() => ({
    exchangeCodeForToken: jest.fn(),
    refreshAccessToken: jest.fn(),
    isConfigured: jest.fn().mockReturnValue(true),
    resolveTokenEndpoint: jest
      .fn()
      .mockReturnValue("https://tenant.authentication.eu10.hana.ondemand.com"),
  })),
}));

describe("OAuth Token Handler", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockXsuaaService: jest.Mocked<XSUAAService>;

  beforeEach(() => {
    mockReq = {
      method: "POST",
      url: "/oauth/token",
      query: {},
      body: {},
      headers: {},
    };

    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    mockXsuaaService = new XSUAAService() as any;
    mockXsuaaService.exchangeCodeForToken = jest.fn();
    mockXsuaaService.getApplicationScopes = jest.fn();
    mockXsuaaService.refreshAccessToken = jest.fn();
    mockXsuaaService.resolveTokenEndpoint = jest
      .fn()
      .mockReturnValue("https://tenant.authentication.eu10.hana.ondemand.com");
  });

  describe("Authorization Code Grant", () => {
    it("should handle POST request with parameters in body", async () => {
      mockReq.method = "POST";
      mockReq.body = {
        grant_type: "authorization_code",
        code: "auth-code-123",
        redirect_uri: "http://localhost:62723/callback",
      };

      const mockTokenData = {
        access_token: "access-token-123",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "refresh-token-123",
      };
      mockXsuaaService.exchangeCodeForToken.mockResolvedValue(mockTokenData);

      const mockScopeData = {
        access_token: "access-token-123",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "refresh-token-123",
        scope: "my-scope",
      };
      mockXsuaaService.getApplicationScopes.mockResolvedValue(mockScopeData);

      await handleTokenRequest(
        mockReq as Request,
        mockRes as Response,
        mockXsuaaService,
      );

      expect(mockXsuaaService.exchangeCodeForToken).toHaveBeenCalledWith(
        "auth-code-123",
        "http://localhost:62723/callback",
        undefined, // code_verifier
        "https://tenant.authentication.eu10.hana.ondemand.com", // tokenEndpoint
      );

      expect(mockRes.json).toHaveBeenCalledWith(mockScopeData);
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should handle GET request with parameters in query string", async () => {
      mockReq.method = "GET";
      mockReq.query = {
        grant_type: "authorization_code",
        code: "auth-code-456",
        redirect_uri: "https://myapp.example.com/callback",
      };

      const mockTokenData = {
        access_token: "access-token-456",
        token_type: "bearer",
        expires_in: 3600,
      };
      mockXsuaaService.exchangeCodeForToken.mockResolvedValue(mockTokenData);

      const mockScopeData = {
        access_token: "access-token-123",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "refresh-token-123",
        scope: "my-scope",
      };
      mockXsuaaService.getApplicationScopes.mockResolvedValue(mockScopeData);

      await handleTokenRequest(
        mockReq as Request,
        mockRes as Response,
        mockXsuaaService,
      );

      expect(mockXsuaaService.exchangeCodeForToken).toHaveBeenCalledWith(
        "auth-code-456",
        "https://myapp.example.com/callback",
        undefined, // code_verifier
        "https://tenant.authentication.eu10.hana.ondemand.com", // tokenEndpoint
      );

      expect(mockRes.json).toHaveBeenCalledWith(mockScopeData);
    });

    it("should merge parameters from both query and body", async () => {
      mockReq.method = "POST";
      mockReq.query = { grant_type: "authorization_code" };
      mockReq.body = {
        code: "auth-code-789",
        redirect_uri: "http://localhost:4004/callback",
      };

      const mockTokenData = {
        access_token: "access-token-789",
        token_type: "bearer",
        expires_in: 3600,
      };
      mockXsuaaService.exchangeCodeForToken.mockResolvedValue(mockTokenData);

      const mockScopeData = {
        access_token: "access-token-789",
        token_type: "bearer",
        expires_in: 3600,
        scope: "my-scope",
      };
      mockXsuaaService.getApplicationScopes.mockResolvedValue(mockScopeData);

      await handleTokenRequest(
        mockReq as Request,
        mockRes as Response,
        mockXsuaaService,
      );

      expect(mockXsuaaService.exchangeCodeForToken).toHaveBeenCalledWith(
        "auth-code-789",
        "http://localhost:4004/callback",
        undefined, // code_verifier
        "https://tenant.authentication.eu10.hana.ondemand.com", // tokenEndpoint
      );

      expect(mockRes.json).toHaveBeenCalledWith(mockScopeData);
    });

    it("should return 400 when code is missing", async () => {
      mockReq.body = {
        grant_type: "authorization_code",
        redirect_uri: "http://localhost:62723/callback",
        // Missing code
      };

      await handleTokenRequest(
        mockReq as Request,
        mockRes as Response,
        mockXsuaaService,
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "invalid_request",
        error_description: "Missing code or redirect_uri",
      });

      expect(mockXsuaaService.exchangeCodeForToken).not.toHaveBeenCalled();
    });

    it("should return 400 when redirect_uri is missing", async () => {
      mockReq.body = {
        grant_type: "authorization_code",
        code: "auth-code-123",
        // Missing redirect_uri
      };

      await handleTokenRequest(
        mockReq as Request,
        mockRes as Response,
        mockXsuaaService,
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "invalid_request",
        error_description: "Missing code or redirect_uri",
      });
    });
  });

  describe("Refresh Token Grant", () => {
    it("should handle refresh token request", async () => {
      mockReq.body = {
        grant_type: "refresh_token",
        refresh_token: "refresh-token-123",
      };

      const mockTokenData = {
        access_token: "new-access-token",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "new-refresh-token",
      };

      mockXsuaaService.refreshAccessToken.mockResolvedValue(mockTokenData);

      await handleTokenRequest(
        mockReq as Request,
        mockRes as Response,
        mockXsuaaService,
      );

      expect(mockXsuaaService.refreshAccessToken).toHaveBeenCalledWith(
        "refresh-token-123",
      );
      expect(mockRes.json).toHaveBeenCalledWith(mockTokenData);
    });

    it("should return 400 when refresh_token is missing", async () => {
      mockReq.body = {
        grant_type: "refresh_token",
        // Missing refresh_token
      };

      await handleTokenRequest(
        mockReq as Request,
        mockRes as Response,
        mockXsuaaService,
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "invalid_request",
        error_description: "Missing refresh_token",
      });

      expect(mockXsuaaService.refreshAccessToken).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should return 400 for unsupported grant type", async () => {
      mockReq.body = {
        grant_type: "client_credentials", // Unsupported
        client_id: "test-client",
        client_secret: "test-secret",
      };

      await handleTokenRequest(
        mockReq as Request,
        mockRes as Response,
        mockXsuaaService,
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "unsupported_grant_type",
        error_description:
          "Only authorization_code and refresh_token are supported",
      });
    });

    it("should handle XSUAA service errors for authorization code", async () => {
      mockReq.body = {
        grant_type: "authorization_code",
        code: "invalid-code",
        redirect_uri: "http://localhost:62723/callback",
      };

      mockXsuaaService.exchangeCodeForToken.mockRejectedValue(
        new Error("Invalid authorization code"),
      );

      await handleTokenRequest(
        mockReq as Request,
        mockRes as Response,
        mockXsuaaService,
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "invalid_grant",
        error_description: "Invalid authorization code",
      });
    });

    it("should handle XSUAA service errors for refresh token", async () => {
      mockReq.body = {
        grant_type: "refresh_token",
        refresh_token: "expired-refresh-token",
      };

      mockXsuaaService.refreshAccessToken.mockRejectedValue(
        new Error("Refresh token expired"),
      );

      await handleTokenRequest(
        mockReq as Request,
        mockRes as Response,
        mockXsuaaService,
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "invalid_grant",
        error_description: "Refresh token expired",
      });
    });

    it("should handle unknown errors", async () => {
      mockReq.body = {
        grant_type: "authorization_code",
        code: "auth-code-123",
        redirect_uri: "http://localhost:62723/callback",
      };

      // Simulate non-Error object being thrown
      mockXsuaaService.exchangeCodeForToken.mockRejectedValue("Unknown error");

      await handleTokenRequest(
        mockReq as Request,
        mockRes as Response,
        mockXsuaaService,
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "invalid_grant",
        error_description: "Unknown error",
      });
    });
  });

  describe("Parameter Extraction", () => {
    it("should prioritize body parameters over query parameters", async () => {
      mockReq.query = {
        grant_type: "refresh_token", // Different from body
        code: "query-code",
      };
      mockReq.body = {
        grant_type: "authorization_code", // This should take precedence
        code: "body-code",
        redirect_uri: "http://localhost:62723/callback",
      };

      const mockTokenData = {
        access_token: "access-token",
        token_type: "bearer",
        expires_in: 3600,
      };

      mockXsuaaService.exchangeCodeForToken.mockResolvedValue(mockTokenData);

      await handleTokenRequest(
        mockReq as Request,
        mockRes as Response,
        mockXsuaaService,
      );

      // Should use body parameters (authorization_code flow with body-code)
      expect(mockXsuaaService.exchangeCodeForToken).toHaveBeenCalledWith(
        "body-code",
        "http://localhost:62723/callback",
        undefined, // code_verifier
        "https://tenant.authentication.eu10.hana.ondemand.com", // tokenEndpoint
      );
    });

    it("should handle mixed parameter sources", async () => {
      mockReq.query = { grant_type: "authorization_code" };
      mockReq.body = {
        code: "mixed-code",
        redirect_uri: "http://localhost:62723/callback",
      };

      const mockTokenData = {
        access_token: "access-token",
        token_type: "bearer",
        expires_in: 3600,
      };

      mockXsuaaService.exchangeCodeForToken.mockResolvedValue(mockTokenData);

      await handleTokenRequest(
        mockReq as Request,
        mockRes as Response,
        mockXsuaaService,
      );

      expect(mockXsuaaService.exchangeCodeForToken).toHaveBeenCalledWith(
        "mixed-code",
        "http://localhost:62723/callback",
        undefined, // code_verifier
        "https://tenant.authentication.eu10.hana.ondemand.com", // tokenEndpoint
      );
    });
  });
});
