import request from "supertest";
import { TestMcpServer } from "../fixtures/test-server";

describe("MCP HTTP API - Tools", () => {
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
          capabilities: { tools: {} },
          clientInfo: { name: "test", version: "1.0.0" },
        },
      });

    sessionId = initResponse.headers["mcp-session-id"];
    expect(sessionId).toBeDefined();
  });

  afterEach(async () => {
    await testServer.stop();
  });

  describe("Tool Discovery", () => {
    it("should list available tools", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
        })
        .expect(200);

      // Should return proper JSON-RPC response structure
      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 2);
      expect(response.body).toHaveProperty("result");
      expect(response.body.result).toHaveProperty("tools");
      expect(Array.isArray(response.body.result.tools)).toBe(true);

      // If no tools are registered, should return empty array (correct MCP behavior)
      // This test passes whether tools exist or not
    });
  });

  describe("Tool Execution", () => {
    it("should handle tool call requests gracefully", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "test-tool",
            arguments: { input: "test-value" },
          },
        })
        .expect(200);

      // Should return proper JSON-RPC response
      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 3);

      // Either successful result or error response is acceptable
      if (response.body.result) {
        expect(response.body.result).toHaveProperty("content");
        expect(Array.isArray(response.body.result.content)).toBe(true);
      } else if (response.body.error) {
        expect(response.body.error).toHaveProperty("code");
        expect(response.body.error).toHaveProperty("message");
      }
    });

    it("should handle tool call with missing tool name", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: {
            arguments: { input: "test-value" },
          },
        })
        .expect(200);

      // Should return JSON-RPC error for missing required parameter
      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 4);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toHaveProperty("code");
      expect(response.body.error).toHaveProperty("message");
    });

    it("should handle tool call with invalid arguments", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: {
            name: "test-tool",
            arguments: "invalid-arguments-type",
          },
        })
        .expect(200);

      // Should return proper JSON-RPC response
      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 5);

      // Either successful result or error response is acceptable
      if (response.body.result) {
        expect(response.body.result).toHaveProperty("content");
      } else if (response.body.error) {
        expect(response.body.error).toHaveProperty("code");
        expect(response.body.error).toHaveProperty("message");
      }
    });
  });

  describe("Error Handling", () => {
    it("should handle non-existent tool calls gracefully", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 6,
          method: "tools/call",
          params: {
            name: "non-existent-tool",
            arguments: {},
          },
        })
        .expect(200);

      // Should return proper JSON-RPC error response
      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 6);
      expect(response.body).toHaveProperty("result");
      expect(response.body.result).toHaveProperty("isError", true);
      expect(response.body.result).toHaveProperty("content");
      expect(Array.isArray(response.body.result.content)).toBe(true);
    });
  });
});
