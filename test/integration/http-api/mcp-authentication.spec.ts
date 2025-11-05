import request from "supertest";
import express from "express";
import McpPlugin from "../../../src/mcp";
import { csn } from "@sap/cds";
import { createAuthTestConfig } from "../../helpers/mock-config";
import { mockLoadConfiguration } from "../../helpers/test-config-loader";

/**
 * Integration tests for MCP authentication flows
 * Tests the complete authentication pipeline from HTTP requests to CAP integration
 */
describe("MCP Authentication - Integration Tests", () => {
  describe("Authentication Enabled (inherit)", () => {
    let app: express.Application;
    let plugin: McpPlugin;

    beforeEach(async () => {
      // Mock configuration loader FIRST, before creating plugin
      mockLoadConfiguration(createAuthTestConfig("inherit"));

      app = express();

      // Mock CDS environment with authentication enabled
      (global as any).cds = {
        env: {
          mcp: {
            auth: "inherit",
          },
          requires: {
            auth: {
              kind: "basic", // Enable basic auth
            },
          },
        },
        context: null, // No authenticated user initially
        User: {
          privileged: { id: "privileged", name: "Privileged User" },
          anonymous: { id: "anonymous", _is_anonymous: true },
        },
        middlewares: {
          before: [
            {
              factory: () => [
                // Mock CAP authentication middleware
                (req: any, res: any, next: any) => {
                  // Simulate CAP auth middleware setting context based on Authorization header
                  const authHeader = req.headers.authorization;
                  if (authHeader && authHeader.startsWith("Basic ")) {
                    // Simulate successful authentication
                    (global as any).cds.context = {
                      user: { id: "authenticated-user", name: "Test User" },
                    };
                  } else {
                    // No auth header or invalid auth
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
      McpPlugin.restInstance();
      plugin = McpPlugin.getInstance();
      await plugin.onBootstrap(app);
      await plugin.onLoaded(createTestModel());
    });

    afterEach(async () => {
      await plugin.onShutdown();
      // Reset global CDS mock
      (global as any).cds = undefined;
    });

    describe("Health Endpoint Access", () => {
      it("should allow unauthenticated access to health endpoint", async () => {
        const response = await request(app).get("/mcp/health").expect(200);

        expect(response.body).toEqual({
          status: "UP",
        });
      });

      it("should allow authenticated access to health endpoint", async () => {
        const response = await request(app)
          .get("/mcp/health")
          .set("Authorization", "Basic dGVzdDp0ZXN0") // test:test
          .expect(200);

        expect(response.body).toEqual({
          status: "UP",
        });
      });
    });

    describe("MCP Endpoint Authentication", () => {
      it("should reject unauthenticated requests to MCP endpoints", async () => {
        const response = await request(app)
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
              clientInfo: { name: "test", version: "1.0.0" },
            },
          })
          .expect(401);

        expect(response.body).toEqual({
          jsonrpc: "2.0",
          error: {
            code: 10,
            message: "Unauthorized",
            id: null,
          },
        });
      });

      it("should reject requests with empty Authorization header", async () => {
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("Authorization", "")
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
          .expect(401);

        expect(response.body).toEqual({
          jsonrpc: "2.0",
          error: {
            code: 10,
            message: "Unauthorized",
            id: null,
          },
        });
      });

      it("should reject requests with invalid Authorization scheme", async () => {
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("Authorization", "Bearer invalid-token")
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
          .expect(401);

        expect(response.body).toEqual({
          jsonrpc: "2.0",
          error: {
            code: 10,
            message: "Unauthorized",
            id: null,
          },
        });
      });

      it("should accept requests with valid Basic authentication", async () => {
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("Authorization", "Basic dGVzdDp0ZXN0") // test:test
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
          .expect(200);

        expect(response.body).toHaveProperty("id", 1);
        expect(response.body).toHaveProperty("result");
        expect(response.body.result).toHaveProperty("capabilities");
        expect(response.headers).toHaveProperty("mcp-session-id");
      });
    });

    describe("Session-based Authentication Flow", () => {
      let sessionId: string;

      beforeEach(async () => {
        // Initialize authenticated session
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

        expect(initResponse.status).toBe(200);
        sessionId = initResponse.headers["mcp-session-id"];
        expect(sessionId).toBeDefined();
      });

      it("should require authentication for subsequent requests even with valid session", async () => {
        // Session ID alone should not be sufficient - still need auth header
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
          .expect(401);

        expect(response.body).toEqual({
          jsonrpc: "2.0",
          error: {
            code: 10,
            message: "Unauthorized",
            id: null,
          },
        });
      });

      it("should accept authenticated requests with valid session", async () => {
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
          .expect(200);

        expect(response.body).toHaveProperty("result");
        expect(response.body.result).toHaveProperty("resources");
      });

      it("should handle session cleanup with authentication", async () => {
        // Delete session with proper authentication
        await request(app)
          .delete("/mcp")
          .set("Authorization", "Basic dGVzdDp0ZXN0")
          .set("mcp-session-id", sessionId)
          .expect(200);

        // Subsequent requests should fail due to invalid session
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("Authorization", "Basic dGVzdDp0ZXN0")
          .set("mcp-session-id", sessionId)
          .send({
            jsonrpc: "2.0",
            id: 3,
            method: "resources/list",
          })
          .expect(400);

        expect(response.body.error.message).toContain(
          "No valid sessions ID provided",
        );
      });
    });
  });

  describe("Authentication Disabled (none)", () => {
    let app: express.Application;
    let plugin: McpPlugin;

    beforeEach(async () => {
      // Mock configuration loader with auth disabled FIRST
      mockLoadConfiguration(createAuthTestConfig("none"));

      app = express();

      // Mock CDS environment with authentication disabled
      (global as any).cds = {
        env: {
          mcp: {
            auth: "none",
          },
          requires: {
            auth: {
              kind: "dummy",
            },
          },
        },
        context: {
          user: { id: "privileged", name: "Privileged User" },
        },
        User: {
          privileged: { id: "privileged", name: "Privileged User" },
          anonymous: { id: "anonymous", _is_anonymous: true },
        },
        middlewares: {
          before: [], // No authentication middleware
        },
      };
      McpPlugin.restInstance();
      plugin = McpPlugin.getInstance();
      await plugin.onBootstrap(app);
      await plugin.onLoaded(createTestModel());
    });

    afterEach(async () => {
      await plugin.onShutdown();
      (global as any).cds = undefined;
    });

    it("should allow unauthenticated access to MCP endpoints", async () => {
      const response = await request(app)
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
            clientInfo: { name: "test", version: "1.0.0" },
          },
        })
        .expect(200);

      expect(response.body).toHaveProperty("id", 1);
      expect(response.body).toHaveProperty("result");
      expect(response.body.result).toHaveProperty("capabilities");
      expect(response.headers).toHaveProperty("mcp-session-id");
    });

    it("should work with or without Authorization header when auth is disabled", async () => {
      // Without auth header
      const response1 = await request(app)
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
            clientInfo: { name: "test", version: "1.0.0" },
          },
        })
        .expect(200);

      // With auth header
      const response2 = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("Authorization", "Basic dGVzdDp0ZXN0")
        .send({
          jsonrpc: "2.0",
          id: 2,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0.0" },
          },
        })
        .expect(200);

      expect(response1.body).toHaveProperty("result");
      expect(response2.body).toHaveProperty("result");
    });
  });

  describe("Error Handler Integration", () => {
    let app: express.Application;
    let plugin: McpPlugin;

    beforeEach(async () => {
      // Mock configuration loader FIRST
      mockLoadConfiguration(createAuthTestConfig("inherit"));

      app = express();

      // Mock CDS environment that throws auth errors
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
                // Mock CAP middleware that throws auth errors
                (req: any, res: any, next: any) => {
                  const authHeader = req.headers.authorization;
                  if (!authHeader) {
                    return next(401); // Throw 401 error
                  }
                  if (authHeader === "Basic Zm9yYmlkZGVu") {
                    // forbidden:forbidden in base64
                    return next(403); // Throw 403 error
                  }
                  // Valid auth
                  (global as any).cds.context = {
                    user: { id: "authenticated-user", name: "Test User" },
                  };
                  next();
                },
              ],
            },
          ],
        },
      };
      McpPlugin.restInstance();
      plugin = McpPlugin.getInstance();
      await plugin.onBootstrap(app);
      await plugin.onLoaded(createTestModel());
    });

    afterEach(async () => {
      await plugin.onShutdown();
      (global as any).cds = undefined;
    });

    it("should handle 401 errors from CAP middleware", async () => {
      const response = await request(app)
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
            clientInfo: { name: "test", version: "1.0.0" },
          },
        })
        .expect(401);

      expect(response.body).toEqual({
        jsonrpc: "2.0",
        error: {
          code: 10,
          message: "Unauthorized",
          id: null,
        },
      });
    });
  });

  /**
   * Creates a test CSN model for authentication tests
   */
  function createTestModel(): csn.CSN {
    return {
      definitions: {
        TestService: {
          kind: "service",
          "@mcp.name": "test-service",
          "@mcp.description": "Test service for auth integration tests",
          "@mcp.prompts": [
            {
              name: "test-prompt",
              title: "Test Prompt",
              description: "A test prompt for auth testing",
              template: "Test template with {{input}}",
              role: "user",
              inputs: [{ key: "input", type: "String" }],
            },
          ],
        },
        "TestService.Books": {
          kind: "entity",
          "@mcp.name": "test-books",
          "@mcp.description": "Test books resource",
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
          "@mcp.description": "Get book information",
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
