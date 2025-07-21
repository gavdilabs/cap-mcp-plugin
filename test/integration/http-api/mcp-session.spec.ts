import request from "supertest";
import { TestMcpServer } from "../fixtures/test-server";

describe("MCP HTTP API - Session Management", () => {
  let testServer: TestMcpServer;
  let app: any;

  beforeEach(async () => {
    testServer = new TestMcpServer();
    await testServer.setup();
    app = testServer.getApp();
  });

  afterEach(async () => {
    await testServer.stop();
  });

  describe("Health Endpoint", () => {
    it("should return health status", async () => {
      const response = await request(app).get("/mcp/health").expect(200);

      expect(response.body).toEqual({
        status: "UP",
      });
    });
  });

  describe("Session Initialization", () => {
    it("should initialize new MCP session", async () => {
      const initializeRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {
            resources: { subscribe: true },
            tools: {},
            prompts: {},
          },
          clientInfo: {
            name: "test-client",
            version: "1.0.0",
          },
        },
      };

      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .send(initializeRequest)
        .expect(200);

      expect(response.body).toHaveProperty("id", 1);
      expect(response.body).toHaveProperty("result");
      expect(response.body.result).toHaveProperty("capabilities");
      expect(response.headers).toHaveProperty("mcp-session-id");
    });

    it("should reject requests without session ID after initialization", async () => {
      const invalidRequest = {
        jsonrpc: "2.0",
        id: 2,
        method: "resources/list",
      };

      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .send(invalidRequest)
        .expect(400);

      expect(response.body).toHaveProperty("error");
      expect(response.body.error.message).toContain(
        "No valid sessions ID provided",
      );
    });
  });

  describe("Session Management with Headers", () => {
    let sessionId: string;

    beforeEach(async () => {
      // Initialize session first
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
            clientInfo: { name: "test", version: "1.0.0" },
          },
        });

      sessionId = initResponse.headers["mcp-session-id"];

      // Add debugging for session ID
      if (!sessionId) {
        console.error("Session initialization failed:", {
          status: initResponse.status,
          headers: initResponse.headers,
          body: initResponse.body,
        });
      }
    });

    it("should accept requests with valid session ID", async () => {
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

      expect(response.body).toHaveProperty("result");
    });

    it("should reject requests with invalid session ID", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", "invalid-session-id")
        .send({
          jsonrpc: "2.0",
          id: 2,
          method: "resources/list",
        })
        .expect(400);

      expect(response.body.error.message).toContain(
        "No valid sessions ID provided",
      );
    });

    it("should handle session cleanup via DELETE", async () => {
      const response = await request(app)
        .delete("/mcp")
        .set("mcp-session-id", sessionId)
        .expect(200);

      // Subsequent requests should fail
      await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 3,
          method: "resources/list",
        })
        .expect(400);
    });
  });

  describe("Error Handling", () => {
    it("should handle malformed JSON", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .send("invalid json")
        .expect(400);

      // Express middleware should catch malformed JSON and return 400
      // This is correct behavior before reaching MCP layer
      expect(response.body).toBeDefined();
    });

    it("should handle missing Content-Type", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .send({ test: "data" })
        .expect(400);

      // Express middleware should catch missing Content-Type
      expect(response.body).toBeDefined();
    });

    it("should handle large payloads gracefully", async () => {
      const largePayload = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "test",
            version: "1.0.0",
            largeData: "a".repeat(10000), // 10KB of data
          },
        },
      };

      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .send(largePayload);

      // Should either succeed or fail gracefully (not crash)
      expect([200, 400, 413]).toContain(response.status);
    });
  });

  describe("Concurrent Sessions", () => {
    it("should handle multiple concurrent sessions", async () => {
      const promises = Array.from({ length: 5 }, async (_, i) => {
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .send({
            jsonrpc: "2.0",
            id: i + 1,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: `client-${i}`, version: "1.0.0" },
            },
          });

        return response.headers["mcp-session-id"];
      });

      const sessionIds = await Promise.all(promises);

      // All sessions should be unique
      const uniqueSessionIds = new Set(sessionIds);
      expect(uniqueSessionIds.size).toBe(5);

      // All sessions should be able to make requests
      const listPromises = sessionIds.map((sessionId) =>
        request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("mcp-session-id", sessionId)
          .send({
            jsonrpc: "2.0",
            id: 1,
            method: "resources/list",
          }),
      );

      const responses = await Promise.all(listPromises);
      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });
  });
});
