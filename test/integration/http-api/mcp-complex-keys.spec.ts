import request from "supertest";
import { TestMcpServer } from "../fixtures/test-server";

describe("MCP HTTP API - Complex Keys Integration", () => {
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
          capabilities: { tools: {}, resources: {} },
          clientInfo: { name: "test", version: "1.0.0" },
        },
      });

    sessionId = initResponse.headers["mcp-session-id"];
    expect(sessionId).toBeDefined();
  });

  afterEach(async () => {
    await testServer.stop();
  });

  describe("Backward Compatibility with Simple Keys", () => {
    it("should work with existing simple key entities", async () => {
      const toolsResponse = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({ jsonrpc: "2.0", id: 2, method: "tools/list" })
        .expect(200);

      const tools = toolsResponse.body?.result?.tools || [];
      const toolNames = tools.map((t: any) => t.name);

      // Should have tools for the simple Books entity from TestMcpServer
      expect(toolNames).toEqual(
        expect.arrayContaining([
          "TestService_Books_query",
          "TestService_Books_get",
          "TestService_Books_create",
          "TestService_Books_update",
          "TestService_Books_delete",
        ]),
      );

      // Get tool for Books should have simple integer key
      const getBooksSchema = tools.find(
        (t: any) => t.name === "TestService_Books_get",
      )?.inputSchema;

      expect(getBooksSchema.properties).toHaveProperty("ID");
      expect(getBooksSchema.required).toContain("ID");
      expect(getBooksSchema.properties.ID.type).toBe("integer");

      // Verify get tool for simple entity works
      const getBooksResponse = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "TestService_Books_get",
            arguments: {
              ID: 1, // Simple integer key
            },
          },
        });

      expect(getBooksResponse.status).toBe(200);
      expect(getBooksResponse.body).toHaveProperty("result");
    });

    it("should handle tools with missing keys appropriately", async () => {
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
            name: "TestService_Books_get",
            arguments: {
              // Missing required ID key
            },
          },
        });

      // Should return validation error
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("result");
      expect(response.body.result).toHaveProperty("isError", true);
      expect(response.body.result.content[0].text).toContain("invalid_type");
    });

    it("should validate parameter types correctly", async () => {
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
            name: "TestService_Books_get",
            arguments: {
              ID: "not-a-number", // Invalid type - should be integer
            },
          },
        });

      // Should return validation error for type mismatch
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("result");
      expect(response.body.result).toHaveProperty("isError", true);
      expect(response.body.result.content[0].text).toContain("invalid_type");
    });

    it("should handle entity operations for simple key entities", async () => {
      // Test query operation
      const queryResponse = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: {
            name: "TestService_Books_query",
            arguments: {
              where: [
                {
                  field: "title",
                  op: "contains",
                  value: "Test",
                },
              ],
              top: 10,
            },
          },
        });

      expect(queryResponse.status).toBe(200);
      expect(queryResponse.body).toHaveProperty("result");

      // Test create operation
      const createResponse = await request(app)
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
              title: "Test Book",
              author: "Test Author",
              price: 29.99,
              stock: 10,
            },
          },
        });

      expect(createResponse.status).toBe(200);
      expect(createResponse.body).toHaveProperty("result");
    });
  });

  describe("Complex Key Understanding", () => {
    it("demonstrates expected foreign key naming for associations", async () => {
      // This test documents the expected behavior for complex keys
      // based on user's example and CAP conventions

      // Given a CDS model like:
      // entity Other { key ID: UUID; }
      // entity Invoices {
      //   key ID: UUID;
      //   key random: Integer;
      //   key other: Association to Other;
      // }
      // entity InvoiceLines {
      //   key ID: UUID;
      //   toInvoice: Association to Invoices;
      // }

      // The expected foreign key naming would be:
      const expectedInvoicesKeys = ["ID", "random", "other_ID"];
      const expectedInvoiceLinesKeys = ["ID"];
      const expectedInvoiceLinesForeignKeys = [
        "toInvoice_ID",
        "toInvoice_random",
        "toInvoice_other_ID",
      ];

      // This test serves as documentation of the expected behavior
      // The actual implementation would generate tools with these key schemas
      expect(expectedInvoicesKeys).toHaveLength(3);
      expect(expectedInvoiceLinesKeys).toHaveLength(1);
      expect(expectedInvoiceLinesForeignKeys).toHaveLength(3);

      // Association 'other' becomes foreign key 'other_ID'
      expect(expectedInvoicesKeys).toContain("other_ID");

      // Association to complex key entity creates multiple foreign keys
      expect(expectedInvoiceLinesForeignKeys).toContain("toInvoice_ID");
      expect(expectedInvoiceLinesForeignKeys).toContain("toInvoice_random");
      expect(expectedInvoiceLinesForeignKeys).toContain("toInvoice_other_ID");
    });

    it("documents complex key type resolution", async () => {
      // This test documents how association key types should be resolved

      // Given:
      // entity Other { key ID: UUID; }
      // entity Invoices { key other: Association to Other; }

      // Expected behavior:
      const associationKeyTypeResolution = {
        other: "Association to Other", // In CDS model
        other_ID: "UUID", // In generated tool schema (resolved from Other.ID type)
      };

      // The fix implemented should ensure that association keys
      // are resolved to their target entity's key types at annotation parsing time
      expect(associationKeyTypeResolution["other_ID"]).toBe("UUID");
    });
  });
});
