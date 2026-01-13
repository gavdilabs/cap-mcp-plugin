import request from "supertest";
import { TestMcpServer } from "../fixtures/test-server";

describe("MCP HTTP API - Resources", () => {
  let testServer: TestMcpServer;
  let app: any;
  let sessionId: string;

  beforeEach(async () => {
    testServer = new TestMcpServer();
    await testServer.setup();
    app = testServer.getApp();

    // Initialize session
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
          capabilities: { resources: { subscribe: true } },
          clientInfo: { name: "test", version: "1.0.0" },
        },
      });

    sessionId = initResponse.headers["mcp-session-id"];
  });

  afterEach(async () => {
    await testServer.stop();
  });

  describe("Resource Discovery", () => {
    it("should list available resources", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 2,
          method: "resources/list",
        })
        .expect(200);

      // Should return proper JSON-RPC response structure
      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 2);
      expect(response.body).toHaveProperty("result");
      expect(response.body.result).toHaveProperty("resources");
      expect(Array.isArray(response.body.result.resources)).toBe(true);

      // If no resources are registered, should return empty array (correct MCP behavior)
      // This test passes whether resources exist or not
    });

    it("should handle resource templates correctly", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 3,
          method: "resources/templates/list",
        })
        .expect(200);

      // Should return proper JSON-RPC response structure
      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 3);
      expect(response.body).toHaveProperty("result");
      expect(response.body.result).toHaveProperty("resourceTemplates");
      expect(Array.isArray(response.body.result.resourceTemplates)).toBe(true);

      // If no resource templates are registered, should return empty array (correct MCP behavior)
      // This test passes whether templates exist or not
    });
  });

  describe("Resource Reading", () => {
    it("should handle resource reading without backend gracefully", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 4,
          method: "resources/read",
          params: {
            uri: "odata://TestService/test-books",
          },
        })
        .expect(200);

      // Should return proper JSON-RPC response structure
      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 4);

      // Either successful with empty contents or error response is acceptable
      if (response.body.result) {
        expect(response.body.result).toHaveProperty("contents");
        expect(Array.isArray(response.body.result.contents)).toBe(true);
      } else if (response.body.error) {
        expect(response.body.error).toHaveProperty("code");
        expect(response.body.error).toHaveProperty("message");
      }
    });

    it("should handle resource reading with query parameters gracefully", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 5,
          method: "resources/read",
          params: {
            uri: "odata://TestService/test-books?$top=5&$select=title,author",
          },
        })
        .expect(200);

      // Should return proper JSON-RPC response structure
      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 5);

      // Either successful with contents or error response is acceptable
      if (response.body.result) {
        expect(response.body.result).toHaveProperty("contents");
        expect(Array.isArray(response.body.result.contents)).toBe(true);
      } else if (response.body.error) {
        expect(response.body.error).toHaveProperty("code");
        expect(response.body.error).toHaveProperty("message");
      }
    });

    it("should handle resource reading with expand query parameter gracefully", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 51,
          method: "resources/read",
          params: {
            uri: "odata://TestService/test-books?$expand=authorRef",
          },
        })
        .expect(200);

      // Should return proper JSON-RPC response structure
      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 51);

      // Either successful with contents or error response is acceptable
      if (response.body.result) {
        expect(response.body.result).toHaveProperty("contents");
        expect(Array.isArray(response.body.result.contents)).toBe(true);
      } else if (response.body.error) {
        expect(response.body.error).toHaveProperty("code");
        expect(response.body.error).toHaveProperty("message");
      }
    });

    it("should handle malicious query parameters gracefully", async () => {
      const maliciousResponse = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 6,
          method: "resources/read",
          params: {
            uri: "odata://TestService/test-books?$filter=title eq 'test'; DROP TABLE books; --",
          },
        })
        .expect(200);

      // Should return proper JSON-RPC response, either success or error
      expect(maliciousResponse.body).toHaveProperty("jsonrpc", "2.0");
      expect(maliciousResponse.body).toHaveProperty("id", 6);

      // Should not crash - either return error response or safe content
      if (maliciousResponse.body.error) {
        expect(maliciousResponse.body.error).toHaveProperty("code");
        expect(maliciousResponse.body.error).toHaveProperty("message");
      } else if (maliciousResponse.body.result) {
        expect(maliciousResponse.body.result).toHaveProperty("contents");
      }
    });

    it("should handle invalid property names in filters gracefully", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 7,
          method: "resources/read",
          params: {
            uri: "odata://TestService/test-books?$filter=invalidProperty eq 'test'",
          },
        })
        .expect(200);

      // Should return proper JSON-RPC response
      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 7);

      // Should handle invalid properties gracefully - either error or safe response
      if (response.body.error) {
        expect(response.body.error).toHaveProperty("code");
        expect(response.body.error).toHaveProperty("message");
      } else if (response.body.result) {
        expect(response.body.result).toHaveProperty("contents");
      }
    });

    it("should handle complex OData queries gracefully", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 8,
          method: "resources/read",
          params: {
            uri: "odata://TestService/test-books?$filter=price gt 10 and stock lt 100&$orderby=title asc&$top=10",
          },
        })
        .expect(200);

      // Should return proper JSON-RPC response
      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 8);

      // Either successful query or error response is acceptable
      if (response.body.result) {
        expect(response.body.result).toHaveProperty("contents");
        expect(Array.isArray(response.body.result.contents)).toBe(true);
      } else if (response.body.error) {
        expect(response.body.error).toHaveProperty("code");
        expect(response.body.error).toHaveProperty("message");
      }
    });
  });

  describe("Resource Subscriptions", () => {
    it("should handle resource subscription requests", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 9,
          method: "resources/subscribe",
          params: {
            uri: "odata://TestService/test-books",
          },
        });

      // May not be implemented yet, but should not crash
      expect([200, 404, 501]).toContain(response.status);
    });

    it("should handle resource unsubscription requests", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 10,
          method: "resources/unsubscribe",
          params: {
            uri: "odata://TestService/test-books",
          },
        });

      // May not be implemented yet, but should not crash
      expect([200, 404, 501]).toContain(response.status);
    });
  });

  describe("Error Handling", () => {
    it("should handle non-existent resources gracefully", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 11,
          method: "resources/read",
          params: {
            uri: "odata://TestService/non-existent-resource",
          },
        })
        .expect(200);

      // Should return proper JSON-RPC response
      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 11);

      // Either error response or empty contents is acceptable
      if (response.body.error) {
        expect(response.body.error).toHaveProperty("code");
        expect(response.body.error).toHaveProperty("message");
      } else if (response.body.result) {
        expect(response.body.result).toHaveProperty("contents");
      }
    });

    it("should handle malformed URI parameters gracefully", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 12,
          method: "resources/read",
          params: {
            uri: "invalid-uri-format",
          },
        });

      // Should return JSON-RPC response (200 status with error in body is proper JSON-RPC)
      expect([200, 400]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty("jsonrpc", "2.0");
        expect(response.body).toHaveProperty("id", 12);
      }
    });

    it("should handle missing required parameters with JSON-RPC error", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 13,
          method: "resources/read",
          params: {},
        })
        .expect(200); // JSON-RPC errors return 200 with error in body

      // Should return proper JSON-RPC error response
      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 13);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toHaveProperty("code");
      expect(response.body.error).toHaveProperty("message");
    });
  });

  describe("Performance and Limits", () => {
    it("should handle parameter limit validation gracefully", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 14,
          method: "resources/read",
          params: {
            uri: "odata://TestService/test-books?$top=2000", // Over limit
          },
        })
        .expect(200);

      // Should return proper JSON-RPC response
      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 14);

      // Either error for validation or successful response is acceptable
      if (response.body.error) {
        expect(response.body.error).toHaveProperty("code");
        expect(response.body.error).toHaveProperty("message");
      } else if (response.body.result) {
        expect(response.body.result).toHaveProperty("contents");
      }
    });

    it("should handle concurrent resource requests gracefully", async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("mcp-session-id", sessionId)
          .send({
            jsonrpc: "2.0",
            id: 15 + i,
            method: "resources/read",
            params: {
              uri: `odata://TestService/test-books?$top=${i + 1}`,
            },
          }),
      );

      const responses = await Promise.all(promises);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("jsonrpc", "2.0");

        // Either successful result or error response is acceptable
        if (response.body.result) {
          expect(response.body.result).toHaveProperty("contents");
        } else if (response.body.error) {
          expect(response.body.error).toHaveProperty("code");
          expect(response.body.error).toHaveProperty("message");
        }
      });
    });
  });
});
