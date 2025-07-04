import express, { Application } from "express";
import McpPlugin from "../../../src/mcp";
import { csn } from "@sap/cds";

/**
 * Test server fixture for MCP HTTP API integration tests
 */
export class TestMcpServer {
  private app: Application;
  private plugin: McpPlugin;
  private server: any;

  constructor() {
    this.app = express();
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
