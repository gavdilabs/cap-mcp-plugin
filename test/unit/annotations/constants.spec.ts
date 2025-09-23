import {
  MCP_ANNOTATION_KEY,
  DEFAULT_ALL_RESOURCE_OPTIONS,
} from "../../../src/annotations/constants";
import { McpResourceOption } from "../../../src/annotations/types";

describe("Annotations - Constants", () => {
  describe("MCP_ANNOTATION_KEY", () => {
    test("should have correct value", () => {
      expect(MCP_ANNOTATION_KEY).toBe("@mcp");
    });
  });

  describe("DEFAULT_ALL_RESOURCE_OPTIONS", () => {
    test("should contain all expected resource options", () => {
      const expectedOptions = ["filter", "orderby", "top", "skip", "select"];
      expectedOptions.forEach((option) => {
        expect(
          DEFAULT_ALL_RESOURCE_OPTIONS.has(option as McpResourceOption),
        ).toBe(true);
      });
    });

    test("should have correct size", () => {
      expect(DEFAULT_ALL_RESOURCE_OPTIONS.size).toBe(5);
    });
  });
});
