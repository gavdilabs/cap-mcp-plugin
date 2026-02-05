import { Request, Response } from "express";
import { handleTokenRequest } from "../../../src/auth/handlers";
import { XSUAAService } from "../../../src/auth/xsuaa-service";

// Mock the logger
jest.mock("../../../src/logger", () => ({
  LOGGER: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock XSUAAService
jest.mock("../../../src/auth/xsuaa-service", () => ({
  XSUAAService: jest.fn().mockImplementation(() => ({
    exchangeCodeForToken: jest.fn(),
    refreshAccessToken: jest.fn(),
    getApplicationScopes: jest.fn(),
    isConfigured: jest.fn().mockReturnValue(true),
  })),
}));

// Mock cds for credentials
const mockCds = {
  env: {
    requires: {
      auth: {
        credentials: {
          clientid: "test-client-id",
          clientsecret: "test-client-secret",
          url: "https://test.authentication.eu10.hana.ondemand.com",
          uaadomain: "authentication.eu10.hana.ondemand.com",
          identityzone: "test-zone",
        },
      },
    },
  },
};

(global as any).cds = mockCds;

// Mock global fetch for subscriber XSUAA calls
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe("OAuth Token Handler", () => {
  let mockReq: Partial<Request> & { get: jest.Mock };
  let mockRes: Partial<Response>;
  let mockXsuaaService: jest.Mocked<XSUAAService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      method: "POST",
      url: "/oauth/token",
      query: {},
      body: {},
      headers: {},
      get: jest.fn().mockReturnValue("localhost:4004"),
    };

    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    mockXsuaaService = new XSUAAService() as any;
    mockXsuaaService.exchangeCodeForToken = jest.fn();
    mockXsuaaService.getApplicationScopes = jest.fn();
    mockXsuaaService.refreshAccessToken = jest.fn();

    // Reset fetch mock
    mockFetch.mockReset();
  });

  describe("Authorization Code Grant", () => {
    it("should handle POST request with parameters in body", async () => {
      mockReq.method = "POST";
      mockReq.body = {
        grant_type: "authorization_code",
        code: "auth-code-123",
        redirect_uri: "http://localhost:62723/callback",
      };

      // Mock fetch for auth code exchange
      const mockTokenData = {
        access_token:
          "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ6aWQiOiJ0ZXN0LXppZCIsImV4dF9hdHRyIjp7InpkbiI6InRlc3Qtem9uZSJ9fQ.signature",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "refresh-token-123",
      };

      const mockScopedToken = {
        access_token:
          "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ6aWQiOiJ0ZXN0LXppZCIsImV4dF9hdHRyIjp7InpkbiI6InRlc3Qtem9uZSJ9LCJzY29wZSI6Im15LXNjb3BlIn0.signature",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "refresh-token-123",
        scope: "my-scope",
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenData),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockScopedToken),
        });

      await handleTokenRequest(
        mockReq as Request,
        mockRes as Response,
        mockXsuaaService,
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockRes.json).toHaveBeenCalledWith(mockScopedToken);
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

      expect(mockFetch).not.toHaveBeenCalled();
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
          "Only authorization_code and refresh_token supported",
      });
    });

    it("should handle fetch errors for authorization code", async () => {
      mockReq.body = {
        grant_type: "authorization_code",
        code: "invalid-code",
        redirect_uri: "http://localhost:62723/callback",
      };

      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                error: "invalid_grant",
                error_description: "Invalid authorization code",
              }),
            ),
        }),
      );

      await handleTokenRequest(
        mockReq as Request,
        mockRes as Response,
        mockXsuaaService,
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "invalid_grant",
        error_description: expect.stringContaining(
          "Invalid authorization code",
        ),
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

    // Note: Network error testing (e.g., fetch failing completely) is better suited for integration tests
    // as mocking Promise.reject with Jest can cause unhandled rejection issues in some test runners.
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
        access_token:
          "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ6aWQiOiJ0ZXN0LXppZCJ9.sig",
        token_type: "bearer",
        expires_in: 3600,
      };

      const mockScopedToken = {
        ...mockTokenData,
        scope: "my-scope",
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenData),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockScopedToken),
        });

      await handleTokenRequest(
        mockReq as Request,
        mockRes as Response,
        mockXsuaaService,
      );

      // Should use body parameters (authorization_code flow)
      expect(mockFetch).toHaveBeenCalled();
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].body.toString()).toContain("body-code");
    });

    it("should handle mixed parameter sources", async () => {
      mockReq.query = { grant_type: "authorization_code" };
      mockReq.body = {
        code: "mixed-code",
        redirect_uri: "http://localhost:62723/callback",
      };

      const mockTokenData = {
        access_token:
          "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ6aWQiOiJ0ZXN0LXppZCJ9.sig",
        token_type: "bearer",
        expires_in: 3600,
      };

      const mockScopedToken = {
        ...mockTokenData,
        scope: "my-scope",
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenData),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockScopedToken),
        });

      await handleTokenRequest(
        mockReq as Request,
        mockRes as Response,
        mockXsuaaService,
      );

      expect(mockFetch).toHaveBeenCalled();
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].body.toString()).toContain("mixed-code");
    });
  });

  describe("Token Caching", () => {
    it("should cache tokens for subsequent requests with same code", async () => {
      const code = "cache-test-code";
      mockReq.body = {
        grant_type: "authorization_code",
        code,
        redirect_uri: "http://localhost:62723/callback",
      };

      const mockTokenData = {
        access_token:
          "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ6aWQiOiJ0ZXN0LXppZCJ9.sig",
        token_type: "bearer",
        expires_in: 3600,
      };

      const mockScopedToken = {
        ...mockTokenData,
        scope: "cached-scope",
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenData),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockScopedToken),
        });

      // First request
      await handleTokenRequest(
        mockReq as Request,
        mockRes as Response,
        mockXsuaaService,
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockRes.json).toHaveBeenCalledWith(mockScopedToken);

      // Reset mocks for second request
      mockFetch.mockClear();
      (mockRes.json as jest.Mock).mockClear();

      // Second request with same code - should hit cache
      await handleTokenRequest(
        mockReq as Request,
        mockRes as Response,
        mockXsuaaService,
      );

      // Should not call fetch again - cached response
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(mockScopedToken);
    });
  });
});
