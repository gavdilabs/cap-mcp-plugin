import request from "supertest";
import { TestMcpServer } from "../fixtures/test-server";

describe("MCP HTTP API - Prompts", () => {
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
          capabilities: { prompts: {} },
          clientInfo: { name: "test", version: "1.0.0" },
        },
      });

    sessionId = initResponse.headers["mcp-session-id"];
  });

  afterEach(async () => {
    await testServer.stop();
  });

  describe("Prompt Discovery", () => {
    it("should list available prompts", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 2,
          method: "prompts/list",
        })
        .expect(200);

      // Should return proper JSON-RPC response structure
      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 2);
      expect(response.body).toHaveProperty("result");
      expect(response.body.result).toHaveProperty("prompts");
      expect(Array.isArray(response.body.result.prompts)).toBe(true);

      // If no prompts are registered, should return empty array (correct MCP behavior)
      // This test passes whether prompts exist or not
    });
  });

  describe("Prompt Execution", () => {
    it("should handle prompt get requests gracefully", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 3,
          method: "prompts/get",
          params: {
            name: "test-prompt",
            arguments: { input: "test-value" },
          },
        })
        .expect(200);

      // Should return proper JSON-RPC response
      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 3);

      // Either successful result or error response is acceptable
      if (response.body.result) {
        expect(response.body.result).toHaveProperty("messages");
        expect(Array.isArray(response.body.result.messages)).toBe(true);
      } else if (response.body.error) {
        expect(response.body.error).toHaveProperty("code");
        expect(response.body.error).toHaveProperty("message");
      }
    });

    it("should handle prompt get with missing prompt name", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 4,
          method: "prompts/get",
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

    it("should handle prompt get with invalid arguments", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 5,
          method: "prompts/get",
          params: {
            name: "test-prompt",
            arguments: "invalid-arguments-type",
          },
        })
        .expect(200);

      // Should return proper JSON-RPC response
      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 5);

      // Either successful result or error response is acceptable
      if (response.body.result) {
        expect(response.body.result).toHaveProperty("messages");
      } else if (response.body.error) {
        expect(response.body.error).toHaveProperty("code");
        expect(response.body.error).toHaveProperty("message");
      }
    });
  });

  describe("Error Handling", () => {
    it("should handle non-existent prompt requests gracefully", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 6,
          method: "prompts/get",
          params: {
            name: "non-existent-prompt",
            arguments: {},
          },
        })
        .expect(200);

      // Should return proper JSON-RPC error response
      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 6);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toHaveProperty("code");
      expect(response.body.error).toHaveProperty("message");
    });
  });
});
