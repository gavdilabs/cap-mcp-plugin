import {
  MCP_ANNOTATION_KEY,
  MCP_ANNOTATION_PROPS,
  DEFAULT_ALL_RESOURCE_OPTIONS,
} from "../../../src/annotations/constants";
import { McpResourceOption } from "../../../src/annotations/types";

describe("Annotations - Constants", () => {
  describe("MCP_ANNOTATION_KEY", () => {
    test("should have correct value", () => {
      expect(MCP_ANNOTATION_KEY).toBe("@mcp");
    });
  });

  describe("MCP_ANNOTATION_PROPS", () => {
    test("should have all required properties", () => {
      expect(MCP_ANNOTATION_PROPS.MCP_NAME).toBe("@mcp.name");
      expect(MCP_ANNOTATION_PROPS.MCP_DESCRIPTION).toBe("@mcp.description");
      expect(MCP_ANNOTATION_PROPS.MCP_RESOURCE).toBe("@mcp.resource");
      expect(MCP_ANNOTATION_PROPS.MCP_TOOL).toBe("@mcp.tool");
      expect(MCP_ANNOTATION_PROPS.MCP_PROMPT).toBe("@mcp.prompts");
      expect(MCP_ANNOTATION_PROPS.MCP_CDSTYPE).toBe("@mcp.cdsType");
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
