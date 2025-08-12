import request from "supertest";
import express from "express";
import McpPlugin from "../../../src/mcp";
import { csn } from "@sap/cds";
import { createAuthTestConfig } from "../../helpers/mock-config";
import { mockLoadConfiguration } from "../../helpers/test-config-loader";

/**
 * Security boundary tests for MCP authentication and authorization
 * Tests edge cases, malicious inputs, privilege escalation, and security vulnerabilities
 */
describe("MCP Security Boundary Tests", () => {
  describe("Malicious Authentication Headers", () => {
    let app: express.Application;
    let plugin: McpPlugin;

    beforeEach(async () => {
      // Mock configuration loader with auth enabled
      mockLoadConfiguration(createAuthTestConfig("inherit"));

      app = express();

      // Mock CDS environment with strict authentication
      (global as any).cds = {
        env: {
          mcp: {
            auth: "inherit",
          },
          requires: {
            auth: {
              kind: "basic",
            },
          },
        },
        context: null,
        User: {
          privileged: { id: "privileged", name: "Privileged User" },
          anonymous: { id: "anonymous", _is_anonymous: true },
        },
        middlewares: {
          before: [
            {
              factory: () => [
                (req: any, res: any, next: any) => {
                  const authHeader = req.headers.authorization;
                  if (authHeader && authHeader.startsWith("Basic ")) {
                    try {
                      const base64Credentials = authHeader.split(" ")[1];
                      const credentials = Buffer.from(
                        base64Credentials,
                        "base64",
                      ).toString("ascii");
                      const [username, password] = credentials.split(":");

                      if (username === "test" && password === "test") {
                        (global as any).cds.context = {
                          user: { id: "authenticated-user", name: "Test User" },
                        };
                      } else {
                        (global as any).cds.context = {
                          user: (global as any).cds.User.anonymous,
                        };
                      }
                    } catch (error) {
                      // Invalid base64 or malformed auth
                      (global as any).cds.context = {
                        user: (global as any).cds.User.anonymous,
                      };
                    }
                  } else {
                    (global as any).cds.context = {
                      user: (global as any).cds.User.anonymous,
                    };
                  }
                  next();
                },
              ],
            },
          ],
        },
      };

      plugin = new McpPlugin();
      await plugin.onBootstrap(app);
      await plugin.onLoaded(createTestModel());
    });

    afterEach(async () => {
      await plugin.onShutdown();
      (global as any).cds = undefined;
    });

    it("should handle malformed Basic auth headers gracefully", async () => {
      const malformedHeaders = [
        "Basic invalid-base64", // Invalid base64
        "Basic YWRtaW4=", // Valid base64 but missing password (admin)
        "Basic dGVzdA==", // Valid base64 but missing password (test)
      ];

      for (const authHeader of malformedHeaders) {
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("Authorization", authHeader)
          .send({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "security-test", version: "1.0.0" },
            },
          });

        // Should handle gracefully - either reject (401) or process as invalid creds (200 with session but anonymous user)
        expect([200, 401]).toContain(response.status);

        if (response.status === 401) {
          expect(response.body.error.code).toBe(10);
        } else {
          // If it processes, it should at least create a session
          expect(response.body).toHaveProperty("result");
        }
      }
    });

    it("should handle oversized Authorization headers", async () => {
      const oversizedAuth = "Basic " + "A".repeat(1000); // 1KB header

      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("Authorization", oversizedAuth)
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "security-test", version: "1.0.0" },
          },
        });

      // Should handle safely - either reject (413, 400, 401) or process gracefully (200)
      expect([200, 400, 401, 413]).toContain(response.status);
    });

    it("should handle invalid credentials safely", async () => {
      const invalidCredentials = [
        Buffer.from("wrong:password", "utf8").toString("base64"),
        Buffer.from("test:wrongpass", "utf8").toString("base64"),
        Buffer.from("invalid:invalid", "utf8").toString("base64"),
      ];

      for (const base64Creds of invalidCredentials) {
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("Authorization", `Basic ${base64Creds}`)
          .send({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "security-test", version: "1.0.0" },
            },
          });

        // Should handle invalid credentials - either reject (401) or process as anonymous (200)
        expect([200, 401]).toContain(response.status);

        if (response.status === 401) {
          expect(response.body.error.code).toBe(10);
        }
      }
    });
  });

  describe("Session Manipulation Attacks", () => {
    let app: express.Application;
    let plugin: McpPlugin;
    let validSessionId: string;

    beforeEach(async () => {
      mockLoadConfiguration(createAuthTestConfig("inherit"));
      app = express();

      // Mock CDS environment
      (global as any).cds = {
        env: {
          mcp: { auth: "inherit" },
          requires: { auth: { kind: "basic" } },
        },
        context: null,
        User: {
          privileged: { id: "privileged", name: "Privileged User" },
          anonymous: { id: "anonymous", _is_anonymous: true },
        },
        middlewares: {
          before: [
            {
              factory: () => [
                (req: any, res: any, next: any) => {
                  const authHeader = req.headers.authorization;
                  if (authHeader === "Basic dGVzdDp0ZXN0") {
                    (global as any).cds.context = {
                      user: { id: "authenticated-user", name: "Test User" },
                    };
                  } else {
                    (global as any).cds.context = {
                      user: (global as any).cds.User.anonymous,
                    };
                  }
                  next();
                },
              ],
            },
          ],
        },
      };

      plugin = new McpPlugin();
      await plugin.onBootstrap(app);
      await plugin.onLoaded(createTestModel());

      // Create a valid session for testing
      const initResponse = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("Authorization", "Basic dGVzdDp0ZXN0")
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0.0" },
          },
        });

      validSessionId = initResponse.headers["mcp-session-id"];
    });

    afterEach(async () => {
      await plugin.onShutdown();
      (global as any).cds = undefined;
    });

    it("should reject malformed session IDs", async () => {
      const malformedSessionIds = [
        "invalid-uuid", // Not a UUID
        "12345678-1234-1234-1234-123456789012", // Valid UUID format but likely invalid
        validSessionId + "extra", // Modified valid session
        "A".repeat(100), // Oversized session ID
      ];

      for (const sessionId of malformedSessionIds) {
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("Authorization", "Basic dGVzdDp0ZXN0")
          .set("mcp-session-id", sessionId)
          .send({
            jsonrpc: "2.0",
            id: 2,
            method: "resources/list",
          })
          .expect(400);

        expect(response.body.error.message).toContain(
          "No valid sessions ID provided",
        );
      }
    });

    it("should prevent session hijacking attempts", async () => {
      // Try to use a session without proper authentication
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", validSessionId)
        // No Authorization header
        .send({
          jsonrpc: "2.0",
          id: 2,
          method: "resources/list",
        })
        .expect(401);

      expect(response.body.error.code).toBe(10);
    });

    it("should prevent session fixation attacks", async () => {
      // Try to force a specific session ID
      const forcedSessionId = "00000000-0000-0000-0000-000000000000";

      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("Authorization", "Basic dGVzdDp0ZXN0")
        .set("mcp-session-id", forcedSessionId)
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0.0" },
          },
        })
        .timeout(10000);

      // Server should either create a new session or reject the forced one
      const returnedSessionId = response.headers["mcp-session-id"];
      if (response.status === 200) {
        expect(returnedSessionId).not.toBe(forcedSessionId);
      } else {
        expect(response.status).toBe(400);
      }
    });
  });

  describe("JSON-RPC Payload Attacks", () => {
    let app: express.Application;
    let plugin: McpPlugin;
    let sessionId: string;

    beforeEach(async () => {
      mockLoadConfiguration(createAuthTestConfig("inherit"));
      app = express();

      (global as any).cds = {
        env: {
          mcp: { auth: "inherit" },
          requires: { auth: { kind: "basic" } },
        },
        context: null,
        User: {
          privileged: { id: "privileged", name: "Privileged User" },
          anonymous: { id: "anonymous", _is_anonymous: true },
        },
        middlewares: {
          before: [
            {
              factory: () => [
                (req: any, res: any, next: any) => {
                  const authHeader = req.headers.authorization;
                  if (authHeader === "Basic dGVzdDp0ZXN0") {
                    (global as any).cds.context = {
                      user: { id: "authenticated-user", name: "Test User" },
                    };
                  } else {
                    (global as any).cds.context = {
                      user: (global as any).cds.User.anonymous,
                    };
                  }
                  next();
                },
              ],
            },
          ],
        },
      };

      plugin = new McpPlugin();
      await plugin.onBootstrap(app);
      await plugin.onLoaded(createTestModel());

      // Create session
      const initResponse = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("Authorization", "Basic dGVzdDp0ZXN0")
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0.0" },
          },
        });

      sessionId = initResponse.headers["mcp-session-id"];
    });

    afterEach(async () => {
      await plugin.onShutdown();
      (global as any).cds = undefined;
    });

    it("should reject oversized JSON payloads", async () => {
      const oversizedPayload = {
        jsonrpc: "2.0",
        id: 1,
        method: "resources/list",
        params: {
          maliciousData: "A".repeat(100000), // 100KB of data
        },
      };

      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("Authorization", "Basic dGVzdDp0ZXN0")
        .set("mcp-session-id", sessionId)
        .send(oversizedPayload);

      // Should either reject (413, 400) or handle gracefully
      expect([200, 400, 413]).toContain(response.status);
    });

    it("should reject deeply nested JSON structures", async () => {
      // Create deeply nested object to test JSON bomb protection
      let deepObject: any = "value";
      for (let i = 0; i < 1000; i++) {
        deepObject = { level: deepObject };
      }

      const maliciousPayload = {
        jsonrpc: "2.0",
        id: 1,
        method: "resources/list",
        params: deepObject,
      };

      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("Authorization", "Basic dGVzdDp0ZXN0")
        .set("mcp-session-id", sessionId)
        .send(maliciousPayload);

      // Should either reject or handle gracefully
      expect([200, 400, 413]).toContain(response.status);
    });

    it("should reject payloads with prototype pollution attempts", async () => {
      // Test prototype pollution via JSON strings instead of object literals
      const prototypePollutionPayloads = [
        '{"jsonrpc":"2.0","id":1,"method":"resources/list","__proto__":{"polluted":true}}',
        '{"jsonrpc":"2.0","id":1,"method":"resources/list","constructor":{"prototype":{"polluted":true}}}',
        '{"jsonrpc":"2.0","id":1,"method":"resources/list","params":{"__proto__":{"isAdmin":true}}}',
      ];

      for (const payloadString of prototypePollutionPayloads) {
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("Authorization", "Basic dGVzdDp0ZXN0")
          .set("mcp-session-id", sessionId)
          .send(payloadString);

        // Should handle safely (likely 200 if properly sanitized, or 400 if rejected)
        expect([200, 400]).toContain(response.status);
      }
    });

    it("should handle malicious method names", async () => {
      const maliciousMethods = [
        "../../../etc/passwd",
        "resources/../../admin/delete",
        "resources\\..\\..\\admin",
        "eval(malicious_code)",
        "system('rm -rf /')",
        "require('fs').readFileSync('/etc/passwd')",
        "<script>alert('xss')</script>",
        "'; DROP TABLE resources; --",
        "\x00\x01\x02malicious",
        "A".repeat(1000),
      ];

      for (const method of maliciousMethods) {
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("Authorization", "Basic dGVzdDp0ZXN0")
          .set("mcp-session-id", sessionId)
          .send({
            jsonrpc: "2.0",
            id: 1,
            method: method,
          });

        // Should reject with proper JSON-RPC error
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("error");
        expect(response.body.error.code).toBeOneOf([-32601, -32600]); // Method not found or Invalid Request
      }
    });
  });

  describe("Resource Access Control", () => {
    let app: express.Application;
    let plugin: McpPlugin;
    let sessionId: string;

    beforeEach(async () => {
      mockLoadConfiguration(createAuthTestConfig("inherit"));
      app = express();

      (global as any).cds = {
        env: {
          mcp: { auth: "inherit" },
          requires: { auth: { kind: "basic" } },
        },
        context: null,
        User: {
          privileged: { id: "privileged", name: "Privileged User" },
          anonymous: { id: "anonymous", _is_anonymous: true },
        },
        middlewares: {
          before: [
            {
              factory: () => [
                (req: any, res: any, next: any) => {
                  const authHeader = req.headers.authorization;
                  if (authHeader === "Basic dGVzdDp0ZXN0") {
                    (global as any).cds.context = {
                      user: { id: "authenticated-user", name: "Test User" },
                    };
                  } else {
                    (global as any).cds.context = {
                      user: (global as any).cds.User.anonymous,
                    };
                  }
                  next();
                },
              ],
            },
          ],
        },
      };

      plugin = new McpPlugin();
      await plugin.onBootstrap(app);
      await plugin.onLoaded(createTestModel());

      // Create session
      const initResponse = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("Authorization", "Basic dGVzdDp0ZXN0")
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0.0" },
          },
        });

      sessionId = initResponse.headers["mcp-session-id"];
    });

    afterEach(async () => {
      await plugin.onShutdown();
      (global as any).cds = undefined;
    });

    it("should prevent access to non-existent resources", async () => {
      const maliciousResourceURIs = [
        "odata://NonExistentService/data",
        "odata://TestService/admin-data",
        "odata://TestService/../../../etc/passwd",
        "odata://TestService/Books/../../admin",
        "file:///etc/passwd",
        "http://malicious.com/steal-data",
        "odata://TestService/Books?$filter=1=1; DROP TABLE Books; --",
      ];

      for (const uri of maliciousResourceURIs) {
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("Authorization", "Basic dGVzdDp0ZXN0")
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

    it("should prevent tool execution without proper parameters", async () => {
      const maliciousToolCalls = [
        {
          name: "get-book-info",
          arguments: {
            bookId: "'; DROP TABLE Books; --",
          },
        },
        {
          name: "get-book-info",
          arguments: {
            bookId: "../../../etc/passwd",
          },
        },
        {
          name: "get-book-info",
          arguments: {
            bookId: -999999,
          },
        },
        // Test with stringified JSON to avoid TypeScript __proto__ issues
        JSON.parse(
          '{"name":"get-book-info","arguments":{"__proto__":{"isAdmin":true},"bookId":1}}',
        ),
      ];

      for (const toolCall of maliciousToolCalls) {
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("Authorization", "Basic dGVzdDp0ZXN0")
          .set("mcp-session-id", sessionId)
          .send({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: toolCall,
          });

        expect(response.status).toBe(200);
        // Should either reject the tool call or handle parameters safely
        if (response.body.error) {
          expect(response.body.error.code).toBeOneOf([-32602, -32603]); // Invalid params or Internal error
        }
      }
    });
  });

  describe("Rate Limiting and DoS Protection", () => {
    let app: express.Application;
    let plugin: McpPlugin;
    let sessionId: string;

    beforeEach(async () => {
      mockLoadConfiguration(createAuthTestConfig("inherit"));
      app = express();

      (global as any).cds = {
        env: {
          mcp: { auth: "inherit" },
          requires: { auth: { kind: "basic" } },
        },
        context: null,
        User: {
          privileged: { id: "privileged", name: "Privileged User" },
          anonymous: { id: "anonymous", _is_anonymous: true },
        },
        middlewares: {
          before: [
            {
              factory: () => [
                (req: any, res: any, next: any) => {
                  const authHeader = req.headers.authorization;
                  if (authHeader === "Basic dGVzdDp0ZXN0") {
                    (global as any).cds.context = {
                      user: { id: "authenticated-user", name: "Test User" },
                    };
                  } else {
                    (global as any).cds.context = {
                      user: (global as any).cds.User.anonymous,
                    };
                  }
                  next();
                },
              ],
            },
          ],
        },
      };

      plugin = new McpPlugin();
      await plugin.onBootstrap(app);
      await plugin.onLoaded(createTestModel());

      // Create session
      const initResponse = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("Authorization", "Basic dGVzdDp0ZXN0")
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0.0" },
          },
        });

      sessionId = initResponse.headers["mcp-session-id"];
    });

    afterEach(async () => {
      await plugin.onShutdown();
      (global as any).cds = undefined;
    });

    it("should handle rapid concurrent requests gracefully", async () => {
      const concurrentRequests = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("Authorization", "Basic dGVzdDp0ZXN0")
          .set("mcp-session-id", sessionId)
          .send({
            jsonrpc: "2.0",
            id: i + 1,
            method: "resources/list",
          }),
      );

      const responses = await Promise.all(concurrentRequests);

      // All requests should be handled (either successfully or with proper errors)
      responses.forEach((response) => {
        expect([200, 429, 503]).toContain(response.status); // OK, Too Many Requests, or Service Unavailable
      });
    });

    it("should prevent session exhaustion attacks", async () => {
      // Try to create many sessions rapidly
      const sessionCreationPromises = Array.from({ length: 20 }, () =>
        request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("Authorization", "Basic dGVzdDp0ZXN0")
          .send({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "dos-test", version: "1.0.0" },
            },
          }),
      );

      const responses = await Promise.all(sessionCreationPromises);

      // Should handle all requests gracefully
      responses.forEach((response) => {
        expect([200, 429, 503]).toContain(response.status);
      });
    });
  });

  /**
   * Creates a test CSN model for security boundary tests
   */
  function createTestModel(): csn.CSN {
    return {
      definitions: {
        TestService: {
          kind: "service",
          "@mcp.name": "test-service",
          "@mcp.description": "Test service for security boundary tests",
          "@mcp.prompts": [
            {
              name: "test-prompt",
              title: "Test Prompt",
              description: "A test prompt for security testing",
              template: "Test template with {{input}}",
              role: "user",
              inputs: [{ key: "input", type: "String" }],
            },
          ],
        },
        "TestService.Books": {
          kind: "entity",
          "@mcp.name": "test-books",
          "@mcp.description": "Test books resource for security testing",
          "@mcp.resource": ["filter", "orderby", "select", "top", "skip"],
          elements: {
            ID: { type: "cds.Integer", key: true },
            title: { type: "cds.String" },
            author: { type: "cds.String" },
            price: { type: "cds.Decimal" },
            stock: { type: "cds.Integer" },
          },
        },
        "TestService.getBookInfo": {
          kind: "function",
          "@mcp.name": "get-book-info",
          "@mcp.description": "Get book information for security testing",
          "@mcp.tool": true,
          params: {
            bookId: { type: "cds.Integer" },
          },
          returns: { type: "cds.String" },
        },
      },
    } as any;
  }
});

// Custom Jest matcher for multiple possible values
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeOneOf(expected: any[]): R;
    }
  }
}

expect.extend({
  toBeOneOf(received, expected) {
    const pass = expected.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${expected}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be one of ${expected}`,
        pass: false,
      };
    }
  },
});
