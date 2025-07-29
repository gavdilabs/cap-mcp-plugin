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
export function mockLoadConfiguration(): void {
  // Only mock once to avoid multiple requires
  if (originalLoadConfiguration) return;

  const configModule = require("../../src/config/loader");
  originalLoadConfiguration = configModule.loadConfiguration;

  // Replace with test-friendly version that always returns auth: "none"
  configModule.loadConfiguration = (): CAPConfiguration => {
    return {
      name: "Test MCP Server",
      version: "1.0.0",
      auth: "none", // Always disable auth for tests
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true, subscribe: false },
        prompts: { listChanged: true },
      },
    };
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
