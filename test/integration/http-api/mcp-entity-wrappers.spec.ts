import request from "supertest";
import { TestMcpServer } from "../fixtures/test-server";

describe("MCP HTTP API - Entity Wrappers", () => {
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
  });

  afterEach(async () => {
    await testServer.stop();
  });

  it("lists entity wrapper tools when global wrapping is enabled", async () => {
    const response = await request(app)
      .post("/mcp")
      .set("Content-Type", "application/json")
      .set("Accept", "application/json, text/event-stream")
      .set("mcp-session-id", sessionId)
      .send({ jsonrpc: "2.0", id: 2, method: "tools/list" })
      .expect(200);

    const tools = response.body?.result?.tools || [];
    const names = tools.map((t: any) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "TestService_Books_query",
        "TestService_Books_get",
        "TestService_Books_create",
        "TestService_Books_update",
        "TestService_Books_delete",
      ]),
    );
  });

  it("respects global modes in config: only query/get when create/update not enabled globally", async () => {
    // Inline server setup with config before plugin creation
    await testServer.stop();
    const express = require("express");
    const { default: McpPlugin } = require("../../../src/mcp");
    const {
      mockLoadConfiguration,
    } = require("../../helpers/test-config-loader");
    const { mockCdsEnvironment } = require("../../helpers/mock-config");
    const app = express();
    mockCdsEnvironment();
    mockLoadConfiguration({
      name: "Test MCP Server",
      version: "1.0.0",
      auth: "none",
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true, subscribe: false },
        prompts: { listChanged: true },
      },
      wrap_entities_to_actions: true,
      wrap_entity_modes: ["query", "get"],
    });
    const plugin = new McpPlugin();
    await plugin.onBootstrap(app);
    // Load a model similar to default fixture
    const model = {
      definitions: {
        TestService: {
          kind: "service",
          "@mcp.name": "test-service",
          "@mcp.description": "Test service",
          "@mcp.prompts": [
            {
              name: "p",
              title: "t",
              description: "d",
              template: "x",
              role: "user",
              inputs: [],
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
          },
        },
      },
    };
    await plugin.onLoaded(model);

    const init = await request(app)
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
    const sid2 = init.headers["mcp-session-id"];

    const resp2 = await request(app)
      .post("/mcp")
      .set("Content-Type", "application/json")
      .set("Accept", "application/json, text/event-stream")
      .set("mcp-session-id", sid2)
      .send({ jsonrpc: "2.0", id: 2, method: "tools/list" })
      .expect(200);

    const tools2 = resp2.body?.result?.tools || [];
    const n2 = tools2.map((t: any) => t.name);
    expect(n2).toEqual(
      expect.arrayContaining([
        "TestService_Books_query",
        "TestService_Books_get",
      ]),
    );
    expect(n2).not.toEqual(
      expect.arrayContaining([
        "TestService_Books_create",
        "TestService_Books_update",
      ]),
    );

    await plugin.onShutdown();
  });

  it("respects per-entity override: update-only for one entity disables query for that entity", async () => {
    // Build a temporary server with entity override
    await testServer.stop();
    const express = require("express");
    const { default: McpPlugin } = require("../../../src/mcp");
    const {
      mockLoadConfiguration,
    } = require("../../helpers/test-config-loader");
    const { mockCdsEnvironment } = require("../../helpers/mock-config");
    const app = express();
    mockCdsEnvironment();
    mockLoadConfiguration({
      name: "Test MCP Server",
      version: "1.0.0",
      auth: "none",
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true, subscribe: false },
        prompts: { listChanged: true },
      },
      wrap_entities_to_actions: true,
      wrap_entity_modes: ["query", "get"],
    });
    const plugin = new McpPlugin();
    await plugin.onBootstrap(app);

    // Create CSN with override
    const model = {
      definitions: {
        TestService: {
          kind: "service",
          "@mcp.name": "test-service",
          "@mcp.description": "d",
          "@mcp.prompts": [
            {
              name: "p",
              title: "t",
              description: "d",
              template: "x",
              role: "user",
              inputs: [],
            },
          ],
        },
        "TestService.Books": {
          kind: "entity",
          "@mcp.name": "test-books",
          "@mcp.description": "Test books resource",
          "@mcp.resource": ["filter", "orderby", "select", "top", "skip"],
          "@mcp.wrap.tools": true,
          "@mcp.wrap.modes": ["update"],
          elements: {
            ID: { type: "cds.Integer", key: true },
            title: { type: "cds.String" },
          },
        },
        "TestService.Authors": {
          kind: "entity",
          "@mcp.name": "test-authors",
          "@mcp.description": "Test authors resource",
          "@mcp.resource": ["filter", "orderby", "select", "top", "skip"],
          elements: {
            ID: { type: "cds.Integer", key: true },
            name: { type: "cds.String" },
          },
        },
      },
    };
    await plugin.onLoaded(model);

    const init = await request(app)
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
    const sid = init.headers["mcp-session-id"];

    const resp = await request(app)
      .post("/mcp")
      .set("Content-Type", "application/json")
      .set("Accept", "application/json, text/event-stream")
      .set("mcp-session-id", sid)
      .send({ jsonrpc: "2.0", id: 2, method: "tools/list" })
      .expect(200);
    const names3 = (resp.body?.result?.tools || []).map((t: any) => t.name);

    // Books has update only; ensure no query tool for Books
    expect(names3).toEqual(
      expect.arrayContaining(["TestService_Books_update"]),
    );
    expect(names3).not.toEqual(
      expect.arrayContaining(["TestService_Books_query"]),
    );

    // Authors inherits global query/get; ensure query exists for Authors and not affected by Books override
    expect(names3).toEqual(
      expect.arrayContaining([
        "TestService_Authors_query",
        "TestService_Authors_get",
      ]),
    );
  });

  it("registers delete tools with proper schema for keyed entities", async () => {
    const response = await request(app)
      .post("/mcp")
      .set("Content-Type", "application/json")
      .set("Accept", "application/json, text/event-stream")
      .set("mcp-session-id", sessionId)
      .send({ jsonrpc: "2.0", id: 2, method: "tools/list" })
      .expect(200);

    const tools = response.body?.result?.tools || [];
    const deleteBooksTool = tools.find(
      (t: any) => t.name === "TestService_Books_delete",
    );

    expect(deleteBooksTool).toBeDefined();
    expect(deleteBooksTool.description).toContain("Delete");
    expect(deleteBooksTool.description).toContain("cannot be undone");
    expect(deleteBooksTool.inputSchema).toBeDefined();
    expect(deleteBooksTool.inputSchema.properties).toHaveProperty("ID");
  });

  it("preserves existing @mcp.resource annotations when global wrap is enabled", async () => {
    // The key test: verify that the default fixture Books entity has BOTH:
    // 1. Resource annotation (@mcp.resource in test-server.ts line 112)
    // 2. Wrap annotation (@mcp.wrap in test-server.ts line 113-117)
    // 3. Global wrap is enabled (wrap_entities_to_actions: true in test-server.ts line 36)
    // This confirms that existing annotations are preserved and enhanced by global settings

    const toolsResp = await request(app)
      .post("/mcp")
      .set("Content-Type", "application/json")
      .set("Accept", "application/json, text/event-stream")
      .set("mcp-session-id", sessionId)
      .send({ jsonrpc: "2.0", id: 3, method: "tools/list" })
      .expect(200);

    const tools = toolsResp.body?.result?.tools || [];
    const toolNames = tools.map((t: any) => t.name);

    // Books should have wrap tools (explicitly defined in fixture with modes)
    expect(toolNames).toEqual(
      expect.arrayContaining([
        "TestService_Books_query",
        "TestService_Books_get",
        "TestService_Books_update",
        "TestService_Books_create",
        "TestService_Books_delete",
      ]),
    );

    // Books should also have the original function tool (shows original annotations preserved)
    expect(toolNames).toEqual(expect.arrayContaining(["get-book-info"]));

    // The presence of both entity wrap tools AND the original function tool
    // confirms that global wrap settings enhance rather than overwrite existing annotations.
    // This validates that:
    // 1. @mcp.resource annotation is preserved (Books entity functionality)
    // 2. @mcp.wrap annotation is preserved (explicit wrap modes)
    // 3. @mcp.tool annotation is preserved (get-book-info function)
    // 4. Global wrap_entities_to_actions setting works alongside existing annotations
  });

  it("respects entity-level modes when they differ from global modes", async () => {
    // Verify precedence: global modes are ["query", "get"] but entity has ["query", "get", "create", "update", "delete"]
    await testServer.stop();
    const express = require("express");
    const { default: McpPlugin } = require("../../../src/mcp");
    const {
      mockLoadConfiguration,
    } = require("../../helpers/test-config-loader");
    const { mockCdsEnvironment } = require("../../helpers/mock-config");
    const app = express();
    mockCdsEnvironment();
    mockLoadConfiguration({
      name: "Test MCP Server",
      version: "1.0.0",
      auth: "none",
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true, subscribe: false },
        prompts: { listChanged: true },
      },
      wrap_entities_to_actions: true,
      wrap_entity_modes: ["query", "get"], // Global only allows query and get
    });
    const plugin = new McpPlugin();
    await plugin.onBootstrap(app);

    // Create CSN with entity that has MORE modes than global config
    const model = {
      definitions: {
        TestService: {
          kind: "service",
          "@mcp.name": "test-service",
          "@mcp.description": "Test service",
          "@mcp.prompts": [
            {
              name: "p",
              title: "t",
              description: "d",
              template: "x",
              role: "user",
              inputs: [],
            },
          ],
        },
        "TestService.Products": {
          kind: "entity",
          "@mcp.name": "test-products",
          "@mcp.description": "Test products resource",
          "@mcp.resource": ["filter", "orderby", "select", "top", "skip"],
          "@mcp.wrap.tools": true,
          "@mcp.wrap.modes": ["query", "get", "create", "update", "delete"], // Entity wants all modes
          elements: {
            ID: { type: "cds.Integer", key: true },
            name: { type: "cds.String" },
            price: { type: "cds.Decimal" },
          },
        },
      },
    };
    await plugin.onLoaded(model);

    const init = await request(app)
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
    const sid = init.headers["mcp-session-id"];

    const toolsResp = await request(app)
      .post("/mcp")
      .set("Content-Type", "application/json")
      .set("Accept", "application/json, text/event-stream")
      .set("mcp-session-id", sid)
      .send({ jsonrpc: "2.0", id: 2, method: "tools/list" })
      .expect(200);

    const tools = toolsResp.body?.result?.tools || [];
    const toolNames = tools.map((t: any) => t.name);

    // Verify that entity-level modes properly override global modes
    // Global: ["query", "get"] but entity specifies: ["query", "get", "create", "update", "delete"]
    expect(toolNames).toEqual(
      expect.arrayContaining([
        "TestService_Products_query",
        "TestService_Products_get",
        "TestService_Products_create", // These prove entity modes override global
        "TestService_Products_update", // These prove entity modes override global
        "TestService_Products_delete", // These prove entity modes override global
      ]),
    );

    await plugin.onShutdown();
  });
});
