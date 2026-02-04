import { Request } from "express";
import {
  resolveEffectiveHost,
  buildPublicBaseUrl,
  getProtocol,
  normalizeHost,
  extractSubdomain,
  isProductionEnv,
  HostResolverEnv,
} from "../../../src/auth/host-resolver";

// Mock the logger
jest.mock("../../../src/logger", () => ({
  LOGGER: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("Host Resolver", () => {
  // Helper to create mock request
  function mockRequest(
    headers: Record<string, string | undefined> = {},
    protocol = "http",
  ): Request {
    return {
      headers,
      protocol,
      get: jest.fn((name: string) => headers[name.toLowerCase()]),
    } as unknown as Request;
  }

  // Default env for testing (local dev)
  const localDevEnv: HostResolverEnv = {
    appDomain: undefined,
    externalReverseProxy: false,
    nodeEnv: "development",
  };

  // Production environment
  const prodEnv: HostResolverEnv = {
    appDomain: "myapp.cloud",
    externalReverseProxy: false,
    nodeEnv: "production",
  };

  describe("normalizeHost", () => {
    it("should return empty string for undefined input", () => {
      expect(normalizeHost(undefined)).toBe("");
    });

    it("should return empty string for empty input", () => {
      expect(normalizeHost("")).toBe("");
    });

    it("should strip port from host", () => {
      expect(normalizeHost("example.com:8080")).toBe("example.com");
    });

    it("should handle host without port", () => {
      expect(normalizeHost("example.com")).toBe("example.com");
    });

    it("should take first value from comma-separated list", () => {
      expect(normalizeHost("public.example.com, proxy.internal")).toBe(
        "public.example.com",
      );
    });

    it("should trim whitespace", () => {
      expect(normalizeHost("  example.com  ")).toBe("example.com");
    });

    it("should handle comma-separated with ports", () => {
      expect(normalizeHost("public.example.com:443, proxy.internal:8080")).toBe(
        "public.example.com",
      );
    });
  });

  describe("extractSubdomain", () => {
    it("should return empty string when host is undefined", () => {
      expect(extractSubdomain("", "myapp.cloud")).toBe("");
    });

    it("should return empty string when appDomain is undefined", () => {
      expect(extractSubdomain("tenant1.myapp.cloud", undefined)).toBe("");
    });

    it("should extract subdomain correctly", () => {
      expect(extractSubdomain("tenant1.myapp.cloud", "myapp.cloud")).toBe(
        "tenant1",
      );
    });

    it("should handle nested subdomains", () => {
      expect(extractSubdomain("sub.tenant1.myapp.cloud", "myapp.cloud")).toBe(
        "sub.tenant1",
      );
    });

    it("should return empty string when host equals appDomain", () => {
      expect(extractSubdomain("myapp.cloud", "myapp.cloud")).toBe("");
    });

    it("should return empty string when host does not match appDomain", () => {
      expect(extractSubdomain("tenant1.other.com", "myapp.cloud")).toBe("");
    });

    it("should be case-insensitive", () => {
      expect(extractSubdomain("Tenant1.MyApp.Cloud", "myapp.cloud")).toBe(
        "tenant1",
      );
    });

    it("should handle localhost", () => {
      expect(extractSubdomain("localhost", "myapp.cloud")).toBe("");
    });
  });

  describe("resolveEffectiveHost", () => {
    describe("Priority 1: x-forwarded-host", () => {
      it("should use x-forwarded-host when present", () => {
        const req = mockRequest({
          "x-forwarded-host": "public.example.com",
          host: "internal.cf.internal",
        });

        const result = resolveEffectiveHost(req, prodEnv);

        expect(result).toBe("public.example.com");
      });

      it("should strip port from x-forwarded-host", () => {
        const req = mockRequest({
          "x-forwarded-host": "public.example.com:443",
        });

        const result = resolveEffectiveHost(req, prodEnv);

        expect(result).toBe("public.example.com");
      });

      it("should take first value from comma-separated x-forwarded-host", () => {
        const req = mockRequest({
          "x-forwarded-host": "public.example.com, proxy.internal",
        });

        const result = resolveEffectiveHost(req, prodEnv);

        expect(result).toBe("public.example.com");
      });

      it("should use x-forwarded-host even with tenant subdomain", () => {
        const req = mockRequest({
          "x-forwarded-host": "tenant1.myapp.cloud",
        });
        const env: HostResolverEnv = { ...prodEnv, appDomain: "myapp.cloud" };

        const result = resolveEffectiveHost(req, env);

        expect(result).toBe("tenant1.myapp.cloud");
      });
    });

    describe("Priority 2: x-custom-host (only with EXTERNAL_REVERSE_PROXY)", () => {
      it("should NOT use x-custom-host when EXTERNAL_REVERSE_PROXY is false", () => {
        const req = mockRequest({
          "x-custom-host": "custom.example.com",
          host: "internal.host",
        });

        const result = resolveEffectiveHost(req, {
          ...prodEnv,
          appDomain: undefined,
        });

        // Should fall back to host header since EXTERNAL_REVERSE_PROXY is false
        expect(result).toBe("internal.host");
      });

      it("should use x-custom-host when EXTERNAL_REVERSE_PROXY is true", () => {
        const req = mockRequest({
          "x-custom-host": "custom.example.com",
          host: "internal.host",
        });
        const env: HostResolverEnv = {
          ...prodEnv,
          externalReverseProxy: true,
        };

        const result = resolveEffectiveHost(req, env);

        expect(result).toBe("custom.example.com");
      });

      it("should prefer x-forwarded-host over x-custom-host", () => {
        const req = mockRequest({
          "x-forwarded-host": "forwarded.example.com",
          "x-custom-host": "custom.example.com",
        });
        const env: HostResolverEnv = {
          ...prodEnv,
          externalReverseProxy: true,
        };

        const result = resolveEffectiveHost(req, env);

        expect(result).toBe("forwarded.example.com");
      });
    });

    describe("Priority 3: APP_DOMAIN fallback", () => {
      it("should use APP_DOMAIN when x-forwarded-host is missing in production", () => {
        const req = mockRequest({
          host: "app-guid.cfapps.eu10.hana.ondemand.com",
        });
        const env: HostResolverEnv = {
          ...prodEnv,
          appDomain: "myapp.cloud",
        };

        const result = resolveEffectiveHost(req, env);

        expect(result).toBe("myapp.cloud");
      });

      it("should NOT use APP_DOMAIN in non-production environment", () => {
        const req = mockRequest({
          host: "localhost:4004",
        });
        const env: HostResolverEnv = {
          ...localDevEnv,
          appDomain: "myapp.cloud",
        };

        const result = resolveEffectiveHost(req, env);

        // In local dev, should use raw host, not APP_DOMAIN
        expect(result).toBe("localhost");
      });
    });

    describe("Priority 4: Raw host header (local dev fallback)", () => {
      it("should use raw host in local development", () => {
        const req = mockRequest({
          host: "localhost:4004",
        });

        const result = resolveEffectiveHost(req, localDevEnv);

        expect(result).toBe("localhost");
      });

      it("should default to localhost when no host header", () => {
        const req = mockRequest({});
        (req.get as jest.Mock).mockReturnValue(undefined);

        const result = resolveEffectiveHost(req, localDevEnv);

        expect(result).toBe("localhost");
      });
    });
  });

  describe("isProductionEnv", () => {
    it("should return true when nodeEnv is production", () => {
      expect(isProductionEnv({ nodeEnv: "production" })).toBe(true);
    });

    it("should return false when nodeEnv is development", () => {
      expect(isProductionEnv({ nodeEnv: "development" })).toBe(false);
    });

    it("should return false when nodeEnv is test", () => {
      expect(isProductionEnv({ nodeEnv: "test" })).toBe(false);
    });

    it("should return false when nodeEnv is undefined", () => {
      expect(isProductionEnv({})).toBe(false);
    });

    it("should return false for hybrid mode", () => {
      expect(isProductionEnv({ nodeEnv: "hybrid" })).toBe(false);
    });
  });

  describe("getProtocol", () => {
    it("should use x-forwarded-proto when present", () => {
      const req = mockRequest({ "x-forwarded-proto": "https" });

      const result = getProtocol(req, localDevEnv);

      expect(result).toBe("https");
    });

    it("should take first value from comma-separated x-forwarded-proto", () => {
      const req = mockRequest({ "x-forwarded-proto": "https, http" });

      const result = getProtocol(req, localDevEnv);

      expect(result).toBe("https");
    });

    it("should default to https in Cloud Foundry", () => {
      const req = mockRequest({}, "http");

      const result = getProtocol(req, prodEnv);

      expect(result).toBe("https");
    });

    it("should default to https when NODE_ENV=production", () => {
      const req = mockRequest({}, "http");
      const env: HostResolverEnv = {
        ...localDevEnv,
        nodeEnv: "production",
      };

      const result = getProtocol(req, env);

      expect(result).toBe("https");
    });

    it("should use req.protocol in local development", () => {
      const req = mockRequest({}, "http");

      const result = getProtocol(req, localDevEnv);

      expect(result).toBe("http");
    });
  });

  describe("buildPublicBaseUrl", () => {
    it("should combine protocol and host correctly", () => {
      const req = mockRequest({
        "x-forwarded-proto": "https",
        "x-forwarded-host": "tenant1.myapp.cloud",
      });

      const result = buildPublicBaseUrl(req, prodEnv);

      expect(result).toBe("https://tenant1.myapp.cloud");
    });

    it("should build correct URL for local development", () => {
      const req = mockRequest({ host: "localhost:4004" }, "http");

      const result = buildPublicBaseUrl(req, localDevEnv);

      expect(result).toBe("http://localhost");
    });

    it("should build correct URL for CF without x-forwarded headers", () => {
      const req = mockRequest({
        host: "app-guid.cfapps.eu10.hana.ondemand.com",
      });
      const env: HostResolverEnv = {
        ...prodEnv,
        appDomain: "myapp.cloud",
      };

      const result = buildPublicBaseUrl(req, env);

      expect(result).toBe("https://myapp.cloud");
    });
  });

  describe("Backward compatibility", () => {
    it("should work with default env when not provided", () => {
      // This test verifies the module uses process.env when env is not provided
      const req = mockRequest({ host: "localhost:4004" }, "http");

      // Should not throw when called without explicit env
      expect(() => buildPublicBaseUrl(req)).not.toThrow();
    });
  });
});
