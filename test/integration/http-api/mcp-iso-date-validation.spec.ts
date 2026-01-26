/**
 * Integration tests for ISO 8601 date/time validation in MCP tool calls
 *
 * These tests verify that ISO 8601 date strings (the standard format used by AI agents)
 * are correctly accepted by MCP tool calls and entity wrapper operations.
 *
 * Related issue: https://github.com/gavdilabs/cap-mcp-plugin/issues/102
 */

import request from "supertest";
import { TestMcpServer } from "../fixtures/test-server";

describe("MCP HTTP API - ISO 8601 Date Validation", () => {
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

  describe("Tool calls with ISO 8601 date parameters", () => {
    it("should accept ISO 8601 date string for Date parameter", async () => {
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
            name: "get-books-by-date",
            arguments: {
              publishDate: "2026-01-06",
              updatedAfter: "2026-01-06T16:04:43Z",
              createdAfter: "2026-01-06T16:04:43.123Z",
            },
          },
        })
        .expect(200);

      const responseData = response.body;

      // Validation should pass - error should be about service execution, not validation
      expect(responseData.error).toBeUndefined();
      expect(responseData.result).toBeDefined();
      // If there's an error, it should be a service error (validation passed), not a validation error
      if (responseData.result.isError) {
        const errorText = responseData.result.content?.[0]?.text || "";
        // Should not contain Zod validation errors
        expect(errorText).not.toMatch(/invalid.*date/i);
        expect(errorText).not.toMatch(/expected.*date/i);
        expect(errorText).not.toMatch(/invalid_type/i);
      }
    });

    it("should accept ISO 8601 datetime with timezone offset", async () => {
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
            name: "get-books-by-date",
            arguments: {
              publishDate: "2026-01-06",
              updatedAfter: "2026-01-06T16:04:43+08:00",
              createdAfter: "2026-01-06T16:04:43-05:00",
            },
          },
        })
        .expect(200);

      const responseData = response.body;

      expect(responseData.error).toBeUndefined();
      expect(responseData.result).toBeDefined();
      if (responseData.result.isError) {
        const errorText = responseData.result.content?.[0]?.text || "";
        expect(errorText).not.toMatch(/invalid.*date/i);
        expect(errorText).not.toMatch(/expected.*date/i);
        expect(errorText).not.toMatch(/invalid_type/i);
      }
    });

    it("should accept epoch milliseconds for Timestamp parameter", async () => {
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
            name: "get-books-by-date",
            arguments: {
              publishDate: "2026-01-06",
              updatedAfter: "2026-01-06T16:04:43Z",
              createdAfter: 1736159083000, // Epoch milliseconds
            },
          },
        })
        .expect(200);

      const responseData = response.body;

      expect(responseData.error).toBeUndefined();
      expect(responseData.result).toBeDefined();
      if (responseData.result.isError) {
        const errorText = responseData.result.content?.[0]?.text || "";
        expect(errorText).not.toMatch(/invalid.*date/i);
        expect(errorText).not.toMatch(/expected.*date/i);
        expect(errorText).not.toMatch(/invalid_type/i);
      }
    });
  });

  describe("Entity wrapper create with date fields", () => {
    it("should accept ISO 8601 dates in entity create operation", async () => {
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
            name: "TestService_Books_create",
            arguments: {
              ID: 999,
              title: "Test Book",
              stock: 10,
              publishDate: "2026-01-06",
              lastUpdated: "2026-01-06T16:04:43Z",
              createdAt: "2026-01-06T16:04:43.123Z",
            },
          },
        })
        .expect(200);

      const responseData = response.body;

      // Should not have a validation error - dates should be accepted
      expect(responseData.error).toBeUndefined();
      expect(responseData.result).toBeDefined();
      // The actual create may fail due to constraints, but validation should pass
    });

    it("should accept epoch milliseconds for Timestamp in entity create", async () => {
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
            name: "TestService_Books_create",
            arguments: {
              ID: 998,
              title: "Test Book 2",
              stock: 5,
              publishDate: "2026-01-06",
              lastUpdated: "2026-01-06T16:04:43Z",
              createdAt: 1736159083000, // Epoch milliseconds
            },
          },
        })
        .expect(200);

      const responseData = response.body;

      expect(responseData.error).toBeUndefined();
      expect(responseData.result).toBeDefined();
    });
  });

  describe("Entity wrapper update with date fields", () => {
    it("should accept ISO 8601 dates in entity update operation", async () => {
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
            name: "TestService_Books_update",
            arguments: {
              ID: 1,
              lastUpdated: "2026-01-07T10:00:00+08:00",
            },
          },
        })
        .expect(200);

      const responseData = response.body;

      // Should not have a validation error
      expect(responseData.error).toBeUndefined();
      expect(responseData.result).toBeDefined();
    });
  });

  describe("Edge cases for date validation", () => {
    it("should handle datetime with microsecond precision", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 8,
          method: "tools/call",
          params: {
            name: "get-books-by-date",
            arguments: {
              publishDate: "2026-01-06",
              updatedAfter: "2026-01-06T16:04:43.123456Z",
              createdAfter: "2026-01-06T16:04:43.123456789Z",
            },
          },
        })
        .expect(200);

      const responseData = response.body;

      expect(responseData.error).toBeUndefined();
      expect(responseData.result).toBeDefined();
      // If error, should not be a validation error
      if (responseData.result.isError) {
        const errorText = responseData.result.content?.[0]?.text || "";
        expect(errorText).not.toMatch(/invalid.*date/i);
        expect(errorText).not.toMatch(/expected.*date/i);
        expect(errorText).not.toMatch(/invalid_type/i);
      }
    });

    it("should reject invalid date strings with validation error", async () => {
      const response = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 9,
          method: "tools/call",
          params: {
            name: "get-books-by-date",
            arguments: {
              publishDate: "not-a-valid-date",
              updatedAfter: "2026-01-06T16:04:43Z",
              createdAfter: "2026-01-06T16:04:43.123Z",
            },
          },
        })
        .expect(200);

      const responseData = response.body;

      // Should have an error for invalid date
      expect(
        responseData.error ||
          responseData.result?.isError ||
          responseData.result?.content?.[0]?.text?.includes("error"),
      ).toBeTruthy();
    });
  });
});
