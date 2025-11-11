import express, { Application } from "express";
import McpPlugin from "../../../src/mcp";
import { csn } from "@sap/cds";
import { createAuthTestConfig } from "../../helpers/mock-config";
import { mockLoadConfiguration } from "../../helpers/test-config-loader";
import { McpAuthType } from "../../../src/config/types";

/**
 * Authentication-enabled test server fixture for MCP HTTP API integration tests
 */
export class AuthTestMcpServer {
  private app: Application;
  private plugin: McpPlugin;
  private server: any;
  private authType: McpAuthType;
  private capAuthKind: string;

  constructor(
    authType: McpAuthType = "inherit",
    capAuthKind: string = "basic",
  ) {
    this.app = express();
    this.authType = authType;
    this.capAuthKind = capAuthKind;
  }

  /**
   * Sets up the test server with MCP plugin and authentication
   */
  async setup(): Promise<void> {
    // Mock CDS environment with authentication configuration
    this.mockCdsEnvironment();

    // Mock configuration loader
    mockLoadConfiguration(createAuthTestConfig(this.authType));

    // Initialize plugin AFTER mocking environment
    this.plugin = McpPlugin.getInstance();

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
    // Clean up global CDS mock
    (global as any).cds = undefined;
  }

  /**
   * Gets the Express app for testing
   */
  getApp(): Application {
    return this.app;
  }

  /**
   * Updates the CDS context user (for testing different auth scenarios)
   */
  setUser(user: any): void {
    if ((global as any).cds && (global as any).cds.context) {
      (global as any).cds.context.user = user;
    }
  }

  /**
   * Gets the current CDS context user
   */
  getUser(): any {
    return (global as any).cds?.context?.user || null;
  }

  /**
   * Mocks the global CDS environment for authentication tests
   */
  private mockCdsEnvironment(): void {
    const cdsUser = {
      privileged: { id: "privileged", name: "Privileged User" },
      anonymous: { id: "anonymous", _is_anonymous: true },
    };

    (global as any).cds = {
      env: {
        mcp: {
          auth: this.authType,
        },
        requires: {
          auth: {
            kind: this.capAuthKind,
          },
        },
      },
      context: this.createInitialContext(),
      User: cdsUser,
      middlewares: {
        before: this.createAuthMiddleware(),
      },
    };
  }

  /**
   * Creates initial CDS context based on auth configuration
   */
  private createInitialContext(): any {
    if (this.authType === "none" || this.capAuthKind === "dummy") {
      return {
        user: { id: "privileged", name: "Privileged User" },
      };
    }
    return { user: null }; // No user initially for real auth
  }

  /**
   * Creates mock CAP authentication middleware based on configuration
   */
  private createAuthMiddleware(): any[] {
    if (this.authType === "none") {
      return []; // No middleware for disabled auth
    }

    if (this.capAuthKind === "dummy") {
      return [
        {
          factory: () => [
            (req: any, res: any, next: any) => {
              // Dummy auth always provides a test user
              (global as any).cds.context = {
                user: { id: "dummy-user", name: "Dummy User" },
              };
              next();
            },
          ],
        },
      ];
    }

    // Real authentication middleware simulation
    return [
      {
        factory: () => [
          (req: any, res: any, next: any) => {
            const authHeader = req.headers.authorization;

            if (!authHeader || !authHeader.startsWith("Basic ")) {
              // No valid auth header
              (global as any).cds.context = {
                user: (global as any).cds.User.anonymous,
              };
              return next();
            }

            try {
              // Decode basic auth
              const base64Credentials = authHeader.split(" ")[1];
              const credentials = Buffer.from(
                base64Credentials,
                "base64",
              ).toString("ascii");
              const [username, password] = credentials.split(":");

              // Simple test credential validation
              if (username === "test" && password === "test") {
                (global as any).cds.context = {
                  user: {
                    id: "authenticated-user",
                    name: "Test User",
                    roles: ["User"],
                  },
                };
              } else if (username === "admin" && password === "admin") {
                (global as any).cds.context = {
                  user: {
                    id: "admin-user",
                    name: "Admin User",
                    roles: ["Admin"],
                  },
                };
              } else if (username === "forbidden" && password === "forbidden") {
                // Simulate a forbidden user scenario
                return next(403);
              } else {
                // Invalid credentials
                (global as any).cds.context = {
                  user: (global as any).cds.User.anonymous,
                };
              }
            } catch (error) {
              // Malformed auth header
              (global as any).cds.context = {
                user: (global as any).cds.User.anonymous,
              };
            }

            next();
          },
        ],
      },
    ];
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
          "@mcp.description": "Test service for auth integration tests",
          "@mcp.prompts": [
            {
              name: "test-prompt",
              title: "Test Prompt",
              description: "A test prompt for auth testing",
              template: "Test template with {{input}}",
              role: "user",
              inputs: [{ key: "input", type: "String" }],
            },
          ],
        },
        "TestService.Books": {
          kind: "entity",
          "@mcp.name": "test-books",
          "@mcp.description": "Test books resource with auth",
          "@mcp.resource": ["filter", "orderby", "select", "top", "skip"],
          elements: {
            ID: { type: "cds.Integer", key: true },
            title: { type: "cds.String" },
            author: { type: "cds.String" },
            price: { type: "cds.Decimal" },
            stock: { type: "cds.Integer" },
          },
        },
        "TestService.SecureBooks": {
          kind: "entity",
          "@mcp.name": "secure-books",
          "@mcp.description": "Secure books resource requiring authentication",
          "@mcp.resource": ["filter", "select"],
          elements: {
            ID: { type: "cds.Integer", key: true },
            title: { type: "cds.String" },
            confidentialData: { type: "cds.String" },
          },
        },
        "TestService.getBookInfo": {
          kind: "function",
          "@mcp.name": "get-book-info",
          "@mcp.description": "Get book information with auth",
          "@mcp.tool": true,
          params: {
            bookId: { type: "cds.Integer" },
          },
          returns: { type: "cds.String" },
        },
        "TestService.getSecureData": {
          kind: "function",
          "@mcp.name": "get-secure-data",
          "@mcp.description": "Get secure data requiring admin access",
          "@mcp.tool": true,
          params: {
            dataId: { type: "cds.String" },
          },
          returns: { type: "cds.String" },
        },
      },
    } as any;
  }
}

/**
 * Factory functions for creating common auth test server configurations
 */
export class AuthTestServerFactory {
  /**
   * Creates a server with authentication disabled
   */
  static createNoAuthServer(): AuthTestMcpServer {
    return new AuthTestMcpServer("none", "dummy");
  }

  /**
   * Creates a server with basic authentication enabled
   */
  static createBasicAuthServer(): AuthTestMcpServer {
    return new AuthTestMcpServer("inherit", "basic");
  }

  /**
   * Creates a server with dummy authentication (CAP testing mode)
   */
  static createDummyAuthServer(): AuthTestMcpServer {
    return new AuthTestMcpServer("inherit", "dummy");
  }

  /**
   * Creates a server with JWT authentication enabled
   */
  static createJwtAuthServer(): AuthTestMcpServer {
    return new AuthTestMcpServer("inherit", "jwt");
  }

  /**
   * Creates a server with XSUAA authentication enabled
   */
  static createXsuaaAuthServer(): AuthTestMcpServer {
    return new AuthTestMcpServer("inherit", "xsuaa");
  }
}
