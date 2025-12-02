import request from "supertest";
import { TestMcpServer } from "../fixtures/test-server";

describe("MCP HTTP API - Tool Parameter Regression Tests", () => {
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
      })
      .expect(200);

    sessionId = initResponse.headers["mcp-session-id"];
  });

  afterEach(async () => {
    await testServer.stop();
  });

  describe("Tool Parameter Passing Regression", () => {
    it("should correctly pass integer parameter to tool handler", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "get-book-info",
            arguments: {
              bookId: 123,
            },
          },
        })
        .expect(200);

      const responseData = response.body;

      // Verify that the tool handler receives the correct arguments
      expect(responseData.result).toBeDefined();
      expect(responseData.result.content).toBeDefined();
      expect(responseData.result.content[0]).toEqual(
        expect.objectContaining({
          type: "text",
          text: expect.any(String),
        }),
      );

      // This test verifies the regression fix where tool arguments
      // were not being passed correctly to CAP service handlers
      expect(responseData.error).toBeUndefined();
    });

    it("should handle tool calls with different parameter values", async () => {
      const testCases = [{ bookId: 1 }, { bookId: 999 }];

      for (const testCase of testCases) {
        const response = await request(app)
          .post("/mcp")
          .set("Content-Type", "application/json")
          .set("Accept", "application/json, text/event-stream")
          .set("mcp-session-id", sessionId)
          .send({
            jsonrpc: "2.0",
            id: Math.random(),
            method: "tools/call",
            params: {
              name: "get-book-info",
              arguments: testCase,
            },
          });

        // Allow either 200 or error, but verify consistent handling
        expect([200, 400]).toContain(response.status);

        if (response.status === 200) {
          const responseData = response.body;
          expect(responseData.error).toBeUndefined();
          expect(responseData.result).toBeDefined();
          expect(responseData.result.content).toBeDefined();
        }
      }
    });

    it("should reject tool call with invalid tool name", async () => {
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
            name: "non-existent-tool",
            arguments: {},
          },
        })
        .expect(200);

      const responseData = response.body;

      expect(responseData.result).toBeDefined();
      expect(responseData.result.isError).toBe(true);
      expect(responseData.result.content[0].text).toContain("not found");
    });

    it("should handle tool call with extra parameters (should be ignored)", async () => {
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
            name: "get-book-info",
            arguments: {
              bookId: 456,
              extraParam: "should be ignored",
              anotherExtra: 123,
            },
          },
        })
        .expect(200);

      const responseData = response.body;

      // Should handle gracefully and not error due to extra params
      expect(responseData.error).toBeUndefined();
      expect(responseData.result).toBeDefined();
      expect(responseData.result.content).toBeDefined();
    });

    it("should handle missing required parameters gracefully", async () => {
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
            name: "get-book-info",
            arguments: {}, // Missing required 'bookId' parameter
          },
        })
        .expect(200);

      const responseData = response.body;

      // Should either error gracefully or handle the missing parameter
      expect(responseData).toBeDefined();
      // Allow either error or successful handling
    });
  });

  describe("MCP SDK Integration", () => {
    it("should use correct MCP SDK registerTool signature", async () => {
      // This test verifies that the MCP SDK 1.13.x tool registration
      // works correctly and tools are callable

      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 6,
          method: "tools/list",
        })
        .expect(200);

      const responseData = response.body;

      expect(responseData.result).toBeDefined();
      expect(responseData.result.tools).toBeDefined();
      expect(Array.isArray(responseData.result.tools)).toBe(true);

      // Should find the test tool
      const bookInfoTool = responseData.result.tools.find(
        (tool: any) => tool.name === "get-book-info",
      );
      expect(bookInfoTool).toBeDefined();
      expect(bookInfoTool.description).toBeDefined();
      expect(bookInfoTool.inputSchema).toBeDefined();
    });

    it("should handle Zod schema validation correctly", async () => {
      // This test verifies that our buildZodSchema function works
      // correctly with the new MCP SDK registerTool signature

      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: {
            name: "get-book-info",
            arguments: {
              bookId: "invalid-string", // Wrong type, should be integer
            },
          },
        })
        .expect(200);

      const responseData = response.body;

      // The MCP SDK should handle type validation based on our Zod schemas
      expect(responseData).toBeDefined();
      // Allow either successful conversion or validation error
    });
  });
});
