import express, { Application } from "express";
import McpPlugin from "../../../src/mcp";
import { csn } from "@sap/cds";
import { mockCdsEnvironment } from "../../helpers/mock-config";
import { mockLoadConfiguration } from "../../helpers/test-config-loader";

/**
 * Test server fixture for MCP HTTP API integration tests
 */
export class TestMcpServer {
  private app: Application;
  private plugin: McpPlugin;
  private server: any;

  constructor() {
    this.app = express();

    // Mock both CDS environment AND configuration loader
    mockCdsEnvironment();
    // Ensure logger exists on cds mock for integration tests
    (global as any).cds.log = () => ({
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    });
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
      wrap_entity_modes: ["query", "get", "create", "update", "delete"],
    } as any);

    // Initialize plugin AFTER mocking environment
    this.plugin = new McpPlugin();
  }

  /**
   * Sets up the test server with MCP plugin
   */
  async setup(): Promise<void> {
    // Bootstrap the plugin with Express app
    await this.plugin.onBootstrap(this.app);

    // Load test model with annotations
    const testModel = this.createTestModel();
    await this.plugin.onLoaded(testModel);
  }

  /**
   * Starts the test server on a random port
   */
  async start(): Promise<number> {
    return new Promise((resolve) => {
      this.server = this.app.listen(0, () => {
        const port = this.server.address()?.port;
        resolve(port);
      });
    });
  }

  /**
   * Stops the test server and cleans up
   */
  async stop(): Promise<void> {
    await this.plugin.onShutdown();
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server.close(() => resolve());
      });
    }
  }

  /**
   * Gets the Express app for testing
   */
  getApp(): Application {
    return this.app;
  }

  /**
   * Creates a test CSN model with MCP annotations
   */
  private createTestModel(): csn.CSN {
    return {
      definitions: {
        TestService: {
          kind: "service",
          "@mcp.name": "test-service",
          "@mcp.description": "Test service for integration tests",
          "@mcp.prompts": [
            {
              name: "test-prompt",
              title: "Test Prompt",
              description: "A test prompt",
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
          "@mcp.wrap": {
            tools: true,
            modes: ["query", "get", "create", "update", "delete"],
            hint: "Use for tests",
          },
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
}
