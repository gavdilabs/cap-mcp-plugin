import request from "supertest";
import { TestMcpServer } from "../fixtures/test-server";

describe("MCP Resource Security - Integration Tests", () => {
  let testServer: TestMcpServer;
  let app: any;
  let sessionId: string;

  beforeEach(async () => {
    testServer = new TestMcpServer();
    await testServer.setup();
    app = testServer.getApp();

    // Initialize a new MCP session
    const initResponse = await request(app)
      .post("/mcp")
      .set("Content-Type", "application/json")
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "security-test",
            version: "1.0.0",
          },
        },
      });

    expect(initResponse.status).toBe(200);
    expect(initResponse.body).toHaveProperty("result");

    // Extract session ID from response headers
    sessionId = initResponse.header["mcp-session-id"] || "test-session";
  });

  afterEach(async () => {
    await testServer.stop();
  });

  describe("Unauthorized Parameter Rejection", () => {
    it("should reject resource requests with unauthorized parameters", async () => {
      const unauthorizedUris = [
        "odata://TestService/test-books?filter=test&bingbong=malicious",
        "odata://TestService/test-books?admin=true&filter=test",
        "odata://TestService/test-books?malicious=injection",
        "odata://TestService/test-books?system=hack&orderby=title",
        "odata://TestService/test-books?exec=command&select=title",
      ];

      for (const uri of unauthorizedUris) {
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("mcp-session-id", sessionId)
          .send({
            jsonrpc: "2.0",
            id: 1,
            method: "resources/read",
            params: { uri },
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("error");
        expect(response.body.error.message).toContain("not found");
      }
    });

    it("should accept resource requests with only authorized parameters", async () => {
      const authorizedUris = [
        "odata://TestService/test-books?filter=contains(title,'test')",
        "odata://TestService/test-books?orderby=title%20asc",
        "odata://TestService/test-books?select=title,stock",
        "odata://TestService/test-books?top=5",
        "odata://TestService/test-books?skip=10",
        "odata://TestService/test-books?filter=stock%20gt%205&orderby=title&select=title,stock&top=10&skip=0",
      ];

      for (const uri of authorizedUris) {
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("mcp-session-id", sessionId)
          .send({
            jsonrpc: "2.0",
            id: 1,
            method: "resources/read",
            params: { uri },
          });

        expect(response.status).toBe(200);

        // Should either succeed or fail due to missing service, but NOT due to parameter rejection
        if (response.body.error) {
          expect(response.body.error.message).toContain(
            "Invalid service found for service",
          );
          expect(response.body.error.message).not.toContain("not found");
        } else {
          expect(response.body.result).toHaveProperty("contents");
        }
      }
    });
  });

  describe("Parameter Injection Prevention", () => {
    it("should prevent common injection patterns in parameter names", async () => {
      const injectionUris = [
        "odata://TestService/test-books?filter=test&eval=malicious",
        "odata://TestService/test-books?filter=test&exec=rm%20-rf%20/",
        "odata://TestService/test-books?filter=test&system=dangerous",
        "odata://TestService/test-books?filter=test&admin=true",
        "odata://TestService/test-books?filter=test&'; DROP TABLE books; --=hack",
        "odata://TestService/test-books?filter=test&$where=malicious",
        "odata://TestService/test-books?filter=test&__proto__=hack",
      ];

      for (const uri of injectionUris) {
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("mcp-session-id", sessionId)
          .send({
            jsonrpc: "2.0",
            id: 1,
            method: "resources/read",
            params: { uri },
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("error");
        expect(response.body.error.message).toContain("not found");
      }
    });

    it("should be case-sensitive for parameter names", async () => {
      const caseVariationUris = [
        "odata://TestService/test-books?FILTER=test",
        "odata://TestService/test-books?Filter=test",
        "odata://TestService/test-books?fIlTeR=test",
        "odata://TestService/test-books?ORDERBY=title",
        "odata://TestService/test-books?SELECT=title",
      ];

      for (const uri of caseVariationUris) {
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("mcp-session-id", sessionId)
          .send({
            jsonrpc: "2.0",
            id: 1,
            method: "resources/read",
            params: { uri },
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("error");
        expect(response.body.error.message).toContain("not found");
      }
    });
  });

  describe("Static Resource Security", () => {
    it("should reject any query parameters for static resources", async () => {
      const staticResourceUris = [
        "odata://TestService/test-authors?filter=test",
        "odata://TestService/test-authors?any=parameter",
        "odata://TestService/test-authors?harmless=value",
        "odata://TestService/test-authors?bingbong=hack",
      ];

      for (const uri of staticResourceUris) {
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("mcp-session-id", sessionId)
          .send({
            jsonrpc: "2.0",
            id: 1,
            method: "resources/read",
            params: { uri },
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("error");
        expect(response.body.error.message).toContain("not found");
      }
    });

    it("should accept static resources without query parameters", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "resources/read",
          params: {
            uri: "odata://TestService/test-authors",
          },
        });

      expect(response.status).toBe(200);

      // Should either succeed or fail due to missing service, but NOT due to parameter rejection
      if (response.body.error) {
        expect(response.body.error.message).toContain(
          "Resource odata://TestService/test-authors not found",
        );
      } else {
        expect(response.body.result).toHaveProperty("contents");
      }
    });
  });

  describe("Malformed Query Handling", () => {
    it("should reject malformed query strings", async () => {
      const malformedUris = [
        "odata://TestService/test-books?filter", // Missing value
        "odata://TestService/test-books?=value", // Missing key
        "odata://TestService/test-books?&filter=test", // Leading ampersand
        "odata://TestService/test-books?filter=test&", // Trailing ampersand
        "odata://TestService/test-books?filter=test&&top=5", // Double ampersand
      ];

      for (const uri of malformedUris) {
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("mcp-session-id", sessionId)
          .send({
            jsonrpc: "2.0",
            id: 1,
            method: "resources/read",
            params: { uri },
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("error");
        // Should be rejected - either due to malformed query or service not found
        expect(response.body.error.message).toMatch(
          /Invalid service found for service|Resource.*not found/,
        );
      }
    });
  });

  describe("URL Encoding Security", () => {
    it("should reject URL-encoded unauthorized parameter names", async () => {
      const encodedUris = [
        "odata://TestService/test-books?filter=test&%62%69%6E%67%62%6F%6E%67=hack", // bingbong encoded
        "odata://TestService/test-books?filter=test&%61%64%6D%69%6E=true", // admin encoded
        "odata://TestService/test-books?%65%78%65%63=command&filter=test", // exec encoded
        "odata://TestService/test-books?filter=test&%73%79%73%74%65%6D=hack", // system encoded
      ];

      for (const uri of encodedUris) {
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("mcp-session-id", sessionId)
          .send({
            jsonrpc: "2.0",
            id: 1,
            method: "resources/read",
            params: { uri },
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("error");
        expect(response.body.error.message).toContain("not found");
      }
    });

    it("should accept properly encoded authorized parameter names", async () => {
      const encodedUris = [
        "odata://TestService/test-books?%66%69%6C%74%65%72=test", // filter encoded
        "odata://TestService/test-books?%6F%72%64%65%72%62%79=title", // orderby encoded
        "odata://TestService/test-books?%73%65%6C%65%63%74=title", // select encoded
      ];

      for (const uri of encodedUris) {
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("mcp-session-id", sessionId)
          .send({
            jsonrpc: "2.0",
            id: 1,
            method: "resources/read",
            params: { uri },
          });

        expect(response.status).toBe(200);

        // Should either succeed or fail due to missing service, but NOT due to parameter rejection
        if (response.body.error) {
          expect(response.body.error.message).toContain(
            "Invalid service found for service",
          );
          expect(response.body.error.message).not.toContain("not found");
        } else {
          expect(response.body.result).toHaveProperty("contents");
        }
      }
    });
  });

  describe("Comprehensive Security Validation", () => {
    it("should demonstrate complete parameter isolation", async () => {
      // Test that NO unauthorized parameter can bypass validation
      const testParams = [
        "bingbong",
        "admin",
        "root",
        "system",
        "exec",
        "eval",
        "cmd",
        "script",
        "query",
        "sql",
        "__proto__",
        "constructor",
        "prototype",
        "require",
        "process",
        "global",
        "$where",
        "$regex",
        "$gt",
        "$lt",
        "FILTER",
        "Filter",
        "filterr",
        "filter2",
        "filter_",
        "_filter",
      ];

      for (const param of testParams) {
        const uri = `odata://TestService/test-books?filter=test&${param}=hack`;

        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("mcp-session-id", sessionId)
          .send({
            jsonrpc: "2.0",
            id: 1,
            method: "resources/read",
            params: { uri },
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("error");
        expect(response.body.error.message).toContain("not found");
      }
    });
  });
});
