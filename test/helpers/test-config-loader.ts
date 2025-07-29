import { CAPConfiguration } from "../../src/config/types";

/**
 * Test-specific configuration loader that overrides the default behavior
 * to ensure all tests run with auth: "none" unless explicitly overridden
 */

// Store the original loadConfiguration function
let originalLoadConfiguration: (() => CAPConfiguration) | undefined;

/**
 * Mocks the loadConfiguration function to return test-friendly configuration
 */
export function mockLoadConfiguration(testConfig?: CAPConfiguration): void {
  const configModule = require("../../src/config/loader");

  // Store original if not already stored
  if (!originalLoadConfiguration) {
    originalLoadConfiguration = configModule.loadConfiguration;
  }

  // Replace with test-friendly version (allow updates with new config)
  configModule.loadConfiguration = (): CAPConfiguration => {
    return (
      testConfig || {
        name: "Test MCP Server",
        version: "1.0.0",
        auth: "none", // Default: disable auth for tests
        capabilities: {
          tools: { listChanged: true },
          resources: { listChanged: true, subscribe: false },
          prompts: { listChanged: true },
        },
      }
    );
  };
}

/**
 * Restores the original loadConfiguration function
 */
export function restoreLoadConfiguration(): void {
  if (!originalLoadConfiguration) return;

  const configModule = require("../../src/config/loader");
  configModule.loadConfiguration = originalLoadConfiguration;
  originalLoadConfiguration = undefined as any;
}

/**
 * Creates an auth-enabled configuration for testing authentication features
 */
export function createAuthEnabledTestConfig(): CAPConfiguration {
  return {
    name: "Test MCP Server (Auth)",
    version: "1.0.0",
    auth: "inherit",
    capabilities: {
      tools: { listChanged: true },
      resources: { listChanged: true, subscribe: false },
      prompts: { listChanged: true },
    },
  };
}
