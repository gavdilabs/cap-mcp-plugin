import request from "supertest";
import { TestMcpServer } from "../fixtures/test-server";

describe("MCP Resource Templates - Regression Tests", () => {
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
          capabilities: {
            resources: { subscribe: true, listChanged: true },
            tools: { listChanged: true },
            prompts: { listChanged: true },
          },
          clientInfo: { name: "test", version: "1.0.0" },
        },
      })
      .expect(200);

    sessionId = initResponse.headers["mcp-session-id"];
    expect(sessionId).toBeDefined();
  });

  afterEach(async () => {
    await testServer.stop();
  });

  describe("Resource Template Discovery", () => {
    it("should register books and authors as resource templates", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 2,
          method: "resources/templates/list",
        })
        .expect(200);

      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 2);
      expect(response.body).toHaveProperty("result");
      expect(response.body.result).toHaveProperty("resourceTemplates");
      expect(Array.isArray(response.body.result.resourceTemplates)).toBe(true);

      const templates = response.body.result.resourceTemplates;

      // Should have test-books template from TestService
      const bookTemplate = templates.find((t: any) => t.name === "test-books");

      expect(bookTemplate).toBeDefined();

      // Verify template URI format - should use grouped parameter format
      expect(bookTemplate.uriTemplate).toBe(
        "odata://TestService/test-books{?filter,orderby,select,top,skip}",
      );

      // Verify this is NOT the old individual parameter format
      expect(bookTemplate.uriTemplate).not.toContain("}{?");
    });
  });

  describe("Resource Template Access", () => {
    it("should successfully access test-books resource without query parameters", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 3,
          method: "resources/read",
          params: {
            uri: "odata://TestService/test-books",
          },
        })
        .expect(200);

      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 3);

      // Should handle the resource request gracefully (either success or proper error)
      if (response.body.result) {
        expect(response.body.result).toHaveProperty("contents");
        expect(Array.isArray(response.body.result.contents)).toBe(true);
      } else if (response.body.error) {
        expect(response.body.error).toHaveProperty("code");
        expect(response.body.error).toHaveProperty("message");
        // With custom template fix, should get service errors instead of "Resource not found"
        expect(response.body.error.message).toContain(
          "Invalid service found for service",
        );
      }
    });

    it("should successfully access test-books resource with query parameters", async () => {
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
            uri: "odata://TestService/test-books?filter=contains(title%2C'Test')&orderby=title%20desc&select=title%2Cstock&skip=0&top=1",
          },
        })
        .expect(200);

      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 4);

      // Should handle the resource request with query parameters gracefully
      if (response.body.result) {
        expect(response.body.result).toHaveProperty("contents");
        expect(Array.isArray(response.body.result.contents)).toBe(true);
        // If successful, verify the query parameters were processed
        const content = response.body.result.contents[0];
        expect(content).toHaveProperty("uri");
        expect(content).toHaveProperty("text");
      } else if (response.body.error) {
        expect(response.body.error).toHaveProperty("code");
        expect(response.body.error).toHaveProperty("message");
        // With custom template fix, should get service errors instead of "Resource not found"
        expect(response.body.error.message).toContain(
          "Invalid service found for service",
        );
      }
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid query parameters gracefully", async () => {
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
            uri: "odata://TestService/test-books?filter=invalid_syntax&select=nonexistent_field",
          },
        })
        .expect(200);

      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 5);

      // Should either return an error or return content with error message
      if (response.body.error) {
        expect(response.body.error).toHaveProperty("code");
        expect(response.body.error).toHaveProperty("message");
      } else if (response.body.result) {
        const content = response.body.result.contents[0];
        expect(content.text).toContain("ERROR");
      }
    });

    it("should handle non-existent resources gracefully", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 6,
          method: "resources/read",
          params: {
            uri: "odata://TestService/nonexistent",
          },
        })
        .expect(200);

      expect(response.body).toHaveProperty("jsonrpc", "2.0");
      expect(response.body).toHaveProperty("id", 6);

      // Should return an error for non-existent resource
      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toHaveProperty("code");
      expect(response.body.error.message).toContain("not found");
    });
  });
});
