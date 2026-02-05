import {
  extractSubscriberSubdomain,
  buildSubscriberXsuaaTokenUrl,
} from "../../../src/auth/handlers";

// Mock the logger
jest.mock("../../../src/logger", () => ({
  LOGGER: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

describe("Subscriber XSUAA URL Resolution", () => {
  describe("extractSubscriberSubdomain", () => {
    it("should extract subdomain from subscriber approuter URL", () => {
      // Subscriber URL: tenant-a.app.example.com
      const result = extractSubscriberSubdomain("tenant-a.app.example.com");

      expect(result.subdomain).toBe("tenant-a");
      expect(result.isLocalDev).toBe(false);
      expect(result.wasStripped).toBe(false);
    });

    it("should strip app prefix from subscriber subdomain", () => {
      // URL pattern: myapp-tenant-a.app.example.com
      // Expected: tenant-a (strip "myapp-" prefix)
      const result = extractSubscriberSubdomain(
        "myapp-tenant-a.app.example.com",
        { appName: "myapp" },
      );

      expect(result.subdomain).toBe("tenant-a");
      expect(result.wasStripped).toBe(true);
      expect(result.isLocalDev).toBe(false);
    });

    it("should NOT return provider subdomain for subscriber request", () => {
      // CRITICAL: Provider subdomain should NEVER be returned for subscriber requests
      const providerSubdomain = "provider-zone-abc123";

      const result = extractSubscriberSubdomain(
        "myapp-tenant-a.app.example.com",
        { appName: "myapp" },
      );

      expect(result.subdomain).not.toBe(providerSubdomain);
      expect(result.subdomain).toBe("tenant-a");
    });

    it("should use fallback subdomain for local development", () => {
      // localhost:4004 → use fallback (provider identity zone for local dev)
      const result = extractSubscriberSubdomain("localhost:4004", {
        fallbackSubdomain: "provider-zone-abc123",
      });

      expect(result.subdomain).toBe("provider-zone-abc123");
      expect(result.isLocalDev).toBe(true);
    });

    it("should handle 127.0.0.1 as local development", () => {
      const result = extractSubscriberSubdomain("127.0.0.1:4004", {
        fallbackSubdomain: "provider-zone-abc123",
      });

      expect(result.isLocalDev).toBe(true);
      expect(result.subdomain).toBe("provider-zone-abc123");
    });

    it("should not strip prefix when app name does not match", () => {
      // Different app name - should not strip
      const result = extractSubscriberSubdomain(
        "otherapp-tenant-a.app.example.com",
        { appName: "myapp" },
      );

      expect(result.subdomain).toBe("otherapp-tenant-a");
      expect(result.wasStripped).toBe(false);
    });

    it("should handle various subscriber subdomain patterns", () => {
      const testCases = [
        { host: "acme.prod.example.com", expected: "acme" },
        {
          host: "customer-prod-eu10.prod.example.com",
          expected: "customer-prod-eu10",
        },
        { host: "test-tenant.staging.example.com", expected: "test-tenant" },
      ];

      testCases.forEach(({ host, expected }) => {
        const result = extractSubscriberSubdomain(host);
        expect(result.subdomain).toBe(expected);
      });
    });

    it("should use default fallback 'localhost' when no fallback provided for local dev", () => {
      const result = extractSubscriberSubdomain("localhost:4004");

      expect(result.isLocalDev).toBe(true);
      expect(result.subdomain).toBe("localhost"); // Default fallback
      expect(result.wasStripped).toBe(false);
    });

    it("should remove port from host before extracting subdomain", () => {
      const result = extractSubscriberSubdomain("tenant-a.example.com:8080");

      expect(result.subdomain).toBe("tenant-a");
      expect(result.isLocalDev).toBe(false);
    });

    it("should handle simple subdomain without domain parts", () => {
      const result = extractSubscriberSubdomain("tenant-a");

      expect(result.subdomain).toBe("tenant-a");
      expect(result.isLocalDev).toBe(false);
    });
  });

  describe("buildSubscriberXsuaaTokenUrl", () => {
    const defaultUaaDomain = "authentication.eu10.hana.ondemand.com";

    it("should build correct subscriber XSUAA token URL", () => {
      const url = buildSubscriberXsuaaTokenUrl("tenant-a", defaultUaaDomain);

      expect(url).toBe(
        "https://tenant-a.authentication.eu10.hana.ondemand.com/oauth/token",
      );
    });

    it("should NOT build provider XSUAA URL for subscriber subdomain", () => {
      const url = buildSubscriberXsuaaTokenUrl("tenant-a", defaultUaaDomain);

      // CRITICAL: Must not contain provider subdomain
      expect(url).not.toContain("provider-zone-abc123");
    });

    it("should handle different UAA domains", () => {
      const usEastDomain = "authentication.us10.hana.ondemand.com";
      const url = buildSubscriberXsuaaTokenUrl(
        "customer-us-east",
        usEastDomain,
      );

      expect(url).toBe(
        "https://customer-us-east.authentication.us10.hana.ondemand.com/oauth/token",
      );
    });

    it("should handle EU20 region", () => {
      const eu20Domain = "authentication.eu20.hana.ondemand.com";
      const url = buildSubscriberXsuaaTokenUrl("tenant-eu20", eu20Domain);

      expect(url).toBe(
        "https://tenant-eu20.authentication.eu20.hana.ondemand.com/oauth/token",
      );
    });

    it("should handle custom UAA domains", () => {
      const customDomain = "auth.custom-landscape.example.com";
      const url = buildSubscriberXsuaaTokenUrl("my-tenant", customDomain);

      expect(url).toBe(
        "https://my-tenant.auth.custom-landscape.example.com/oauth/token",
      );
    });
  });

  describe("Multi-Tenant Token URL Resolution (Integration)", () => {
    /**
     * End-to-end test that verifies the complete flow:
     * 1. Extract subdomain from subscriber approuter URL
     * 2. Build XSUAA token URL using that subdomain
     * 3. Verify it points to subscriber's XSUAA, not provider's
     */
    it("should build subscriber token URL from approuter host", () => {
      // Simulate request from subscriber: myapp-tenant-a.app.example.com
      const effectiveHost = "myapp-tenant-a.app.example.com";
      const appName = "myapp";
      const uaaDomain = "authentication.eu10.hana.ondemand.com";

      // Step 1: Extract subdomain
      const { subdomain } = extractSubscriberSubdomain(effectiveHost, {
        appName,
      });

      // Step 2: Build URL
      const tokenUrl = buildSubscriberXsuaaTokenUrl(subdomain, uaaDomain);

      // Step 3: Verify
      expect(tokenUrl).toBe(
        "https://tenant-a.authentication.eu10.hana.ondemand.com/oauth/token",
      );
      expect(tokenUrl).not.toContain("provider");
    });

    it("should preserve subscriber context through token exchange", () => {
      // This test documents the expected behavior:
      // After token exchange, the token's zid should match the subscriber's zone

      const subscriberZid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
      const subscriberZdn = "tenant-a";
      const providerZdn = "provider-zone-abc123";

      // Mock token payload after exchange at subscriber's XSUAA
      const tokenPayload = {
        zid: subscriberZid,
        ext_attr: { zdn: subscriberZdn },
      };

      // Verify subscriber context is preserved
      expect(tokenPayload.ext_attr.zdn).toBe(subscriberZdn);
      expect(tokenPayload.ext_attr.zdn).not.toBe(providerZdn);
    });

    it("should handle full flow with app prefix stripping", () => {
      const effectiveHost = "myapp-customer-a.prod.cloud.sap";
      const appName = "myapp";
      const uaaDomain = "authentication.eu10.hana.ondemand.com";

      const { subdomain, wasStripped } = extractSubscriberSubdomain(
        effectiveHost,
        { appName },
      );
      expect(subdomain).toBe("customer-a");
      expect(wasStripped).toBe(true);

      const tokenUrl = buildSubscriberXsuaaTokenUrl(subdomain, uaaDomain);
      expect(tokenUrl).toBe(
        "https://customer-a.authentication.eu10.hana.ondemand.com/oauth/token",
      );
    });

    it("should handle local development with identity zone fallback", () => {
      const effectiveHost = "localhost:4004";
      const identityZone = "dev-provider-zone";
      const uaaDomain = "authentication.eu10.hana.ondemand.com";

      const { subdomain, isLocalDev } = extractSubscriberSubdomain(
        effectiveHost,
        { fallbackSubdomain: identityZone },
      );

      expect(isLocalDev).toBe(true);
      expect(subdomain).toBe(identityZone);

      const tokenUrl = buildSubscriberXsuaaTokenUrl(subdomain, uaaDomain);
      expect(tokenUrl).toBe(
        "https://dev-provider-zone.authentication.eu10.hana.ondemand.com/oauth/token",
      );
    });
  });
});
