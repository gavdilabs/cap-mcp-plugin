import { CAPConfiguration } from "../../src/config/types";

/**
 * Test utilities for creating mock configurations
 */

/**
 * Creates a default test CAPConfiguration with auth disabled
 */
export function createTestConfig(
  overrides: Partial<CAPConfiguration> = {},
): CAPConfiguration {
  return {
    name: "Test Server",
    version: "1.0.0",
    auth: "none", // Disable auth for tests by default
    capabilities: {
      tools: { listChanged: true },
      resources: { listChanged: true, subscribe: false },
      prompts: { listChanged: true },
    },
    ...overrides,
  };
}

/**
 * Mocks the global CDS environment for tests
 */
export function mockCdsEnvironment(): void {
  (global as any).cds = {
    env: {
      mcp: {
        auth: "none",
      },
      requires: {
        auth: {
          kind: "dummy",
        },
      },
    },
    context: {
      user: null,
    },
    User: {
      privileged: { id: "privileged", name: "Privileged User" },
      anonymous: { id: "anonymous", _is_anonymous: true },
    },
    middlewares: {
      before: [], // Empty middleware array for tests
    },
  };
}

/**
 * Creates a test configuration with authentication enabled
 * Use this for testing auth-specific functionality
 */
export function createAuthTestConfig(
  authType: "inherit" | "none" = "inherit",
): CAPConfiguration {
  return createTestConfig({
    auth: authType,
  });
}
