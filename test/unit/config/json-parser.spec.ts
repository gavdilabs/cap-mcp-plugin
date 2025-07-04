import { z } from "zod";
import {
  safeJsonParse,
  parseCAPConfiguration,
  createSafeErrorMessage,
  JsonParseError,
  JsonParseErrorType,
} from "../../../src/config/json-parser";
import { LOGGER } from "../../../src/logger";
import { CAPConfiguration } from "../../../src/config/types";

// Mock the logger
jest.mock("../../../src/logger", () => ({
  LOGGER: {
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

describe("JSON Parser Security", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("safeJsonParse", () => {
    const simpleSchema = z.object({
      name: z.string(),
      value: z.number(),
    });

    test("should parse valid JSON successfully", () => {
      const input = '{"name": "test", "value": 42}';
      const result = safeJsonParse(input, simpleSchema);

      expect(result).toEqual({ name: "test", value: 42 });
      expect(LOGGER.warn).not.toHaveBeenCalled();
    });

    test("should handle whitespace in input", () => {
      const input = '  {"name": "test", "value": 42}  ';
      const result = safeJsonParse(input, simpleSchema);

      expect(result).toEqual({ name: "test", value: 42 });
    });

    test("should reject non-string input", () => {
      const result = safeJsonParse(null as any, simpleSchema);

      expect(result).toBeNull();
      expect(LOGGER.warn).toHaveBeenCalledWith(
        expect.stringContaining("Safe JSON parsing failed: INVALID_INPUT"),
        expect.any(Object),
      );
    });

    test("should reject empty input", () => {
      const result = safeJsonParse("", simpleSchema);

      expect(result).toBeNull();
      expect(LOGGER.warn).toHaveBeenCalled();
    });

    test("should reject whitespace-only input", () => {
      const result = safeJsonParse("   ", simpleSchema);

      expect(result).toBeNull();
      expect(LOGGER.warn).toHaveBeenCalled();
    });

    test("should validate JSON structure before parsing", () => {
      const invalidInput = '{"name": "test", "value": }';
      const result = safeJsonParse(invalidInput, simpleSchema);

      expect(result).toBeNull();
      expect(LOGGER.warn).toHaveBeenCalled();
    });

    test("should detect unbalanced braces", () => {
      const invalidInput = '{"name": "test", "value": 42';
      const result = safeJsonParse(invalidInput, simpleSchema);

      expect(result).toBeNull();
      expect(LOGGER.warn).toHaveBeenCalled();
    });

    test("should detect unbalanced brackets", () => {
      const invalidInput = '["item1", "item2"';
      const result = safeJsonParse(invalidInput, z.array(z.string()));

      expect(result).toBeNull();
      expect(LOGGER.warn).toHaveBeenCalled();
    });

    test("should handle strings with escaped quotes", () => {
      const input = '{"message": "He said \\"Hello\\""}';
      const result = safeJsonParse(input, z.object({ message: z.string() }));

      expect(result).toEqual({ message: 'He said "Hello"' });
    });

    test("should reject schema validation failures", () => {
      const input = '{"name": "test", "value": "not-a-number"}';
      const result = safeJsonParse(input, simpleSchema);

      expect(result).toBeNull();
      expect(LOGGER.warn).toHaveBeenCalledWith(
        expect.stringContaining("VALIDATION_ERROR"),
        expect.any(Object),
      );
    });

    test("should handle nested objects", () => {
      const nested = { level: { nested: { data: "value" } } };
      const input = JSON.stringify(nested);
      const result = safeJsonParse(input, z.any());

      expect(result).toEqual(nested);
    });

    test("should handle arrays correctly", () => {
      const input = '["item1", "item2", "item3"]';
      const result = safeJsonParse(input, z.array(z.string()));

      expect(result).toEqual(["item1", "item2", "item3"]);
    });

    test("should handle mixed arrays and objects", () => {
      const input = '{"items": [{"id": 1, "name": "test"}]}';
      const schema = z.object({
        items: z.array(
          z.object({
            id: z.number(),
            name: z.string(),
          }),
        ),
      });
      const result = safeJsonParse(input, schema);

      expect(result).toEqual({ items: [{ id: 1, name: "test" }] });
    });
  });

  describe("parseCAPConfiguration", () => {
    const validConfig: CAPConfiguration = {
      name: "test-server",
      version: "1.0.0",
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true, subscribe: false },
        prompts: { listChanged: true },
      },
    };

    test("should parse valid CAP configuration", () => {
      const input = JSON.stringify(validConfig);
      const result = parseCAPConfiguration(input);

      expect(result).toEqual(validConfig);
    });

    test("should handle minimal valid configuration", () => {
      const minimalConfig = {
        name: "minimal",
        version: "1.0.0",
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      };

      const input = JSON.stringify(minimalConfig);
      const result = parseCAPConfiguration(input);

      expect(result).toEqual(minimalConfig);
    });

    test("should reject invalid CAP configuration schema", () => {
      const invalidConfig = {
        name: "test",
        // missing version
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      };

      const input = JSON.stringify(invalidConfig);
      const result = parseCAPConfiguration(input);

      expect(result).toBeNull();
      expect(LOGGER.warn).toHaveBeenCalled();
    });

    test("should reject configuration with wrong types", () => {
      const invalidConfig = {
        name: 123, // should be string
        version: "1.0.0",
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      };

      const input = JSON.stringify(invalidConfig);
      const result = parseCAPConfiguration(input);

      expect(result).toBeNull();
    });

    test("should handle optional capability properties", () => {
      const configWithOptionals = {
        name: "test",
        version: "1.0.0",
        capabilities: {
          tools: { listChanged: true },
          resources: { listChanged: false, subscribe: true },
          prompts: { listChanged: false },
        },
      };

      const input = JSON.stringify(configWithOptionals);
      const result = parseCAPConfiguration(input);

      expect(result).toEqual(configWithOptionals);
    });
  });

  describe("Security Tests", () => {
    test("should prevent prototype pollution", () => {
      const maliciousInput = '{"__proto__": {"polluted": true}}';
      const result = safeJsonParse(maliciousInput, z.any());

      // Should still parse but not pollute prototype
      expect(result).toBeTruthy();
      expect((Object.prototype as any).polluted).toBeUndefined();
    });

    test("should handle malicious constructor manipulation", () => {
      const maliciousInput =
        '{"constructor": {"prototype": {"polluted": true}}}';
      const result = safeJsonParse(maliciousInput, z.any());

      expect(result).toBeTruthy();
      expect((Object.prototype as any).polluted).toBeUndefined();
    });

    test("should handle unicode characters safely", () => {
      const input = '{"message": "Hello 🌍 世界"}';
      const result = safeJsonParse(input, z.object({ message: z.string() }));

      expect(result).toEqual({ message: "Hello 🌍 世界" });
    });

    test("should handle null bytes safely", () => {
      const input = '{"data": "value\\u0000with\\u0000nulls"}';
      const result = safeJsonParse(input, z.object({ data: z.string() }));

      expect(result).toEqual({ data: "value\u0000with\u0000nulls" });
    });

    test("should handle control characters", () => {
      const input = '{"data": "value\\nwith\\tcontrol\\rchars"}';
      const result = safeJsonParse(input, z.object({ data: z.string() }));

      expect(result).toEqual({ data: "value\nwith\tcontrol\rchars" });
    });

    test("should handle circular reference attempts", () => {
      // JSON.stringify would throw on circular references, but we test malformed input
      const input = '{"a": {"b": {"a": "circular"}}}';
      const result = safeJsonParse(input, z.any());

      expect(result).toBeTruthy();
    });
  });

  describe("Error Handling", () => {
    test("should log detailed information for debugging", () => {
      const input = '{"invalid": }';
      safeJsonParse(input, z.any());

      expect(LOGGER.warn).toHaveBeenCalledWith(
        expect.stringContaining("Safe JSON parsing failed"),
        expect.objectContaining({
          message: expect.any(String),
          details: expect.any(String),
        }),
      );
    });

    test("should handle unexpected errors gracefully", () => {
      // Mock JSON.parse to throw unexpected error
      const originalParse = JSON.parse;
      JSON.parse = jest.fn().mockImplementation(() => {
        throw new Error("Unexpected error");
      });

      const result = safeJsonParse('{"valid": "json"}', z.any());

      expect(result).toBeNull();
      expect(LOGGER.warn).toHaveBeenCalled();

      // Restore original
      JSON.parse = originalParse;
    });

    test("createSafeErrorMessage should return generic message", () => {
      const message = createSafeErrorMessage("test context");

      expect(message).toContain("test context");
      expect(message).toContain("Configuration parsing failed");
      expect(message).not.toContain("sensitive");
    });
  });

  describe("Edge Cases", () => {
    test("should handle boolean values", () => {
      const input = '{"flag": true, "disabled": false}';
      const result = safeJsonParse(
        input,
        z.object({
          flag: z.boolean(),
          disabled: z.boolean(),
        }),
      );

      expect(result).toEqual({ flag: true, disabled: false });
    });

    test("should handle null values", () => {
      const input = '{"nullable": null}';
      const result = safeJsonParse(
        input,
        z.object({
          nullable: z.null(),
        }),
      );

      expect(result).toEqual({ nullable: null });
    });

    test("should handle numbers including zero", () => {
      const input = '{"zero": 0, "negative": -42, "float": 3.14}';
      const result = safeJsonParse(
        input,
        z.object({
          zero: z.number(),
          negative: z.number(),
          float: z.number(),
        }),
      );

      expect(result).toEqual({ zero: 0, negative: -42, float: 3.14 });
    });

    test("should handle empty objects and arrays", () => {
      const input = '{"empty_obj": {}, "empty_array": []}';
      const result = safeJsonParse(
        input,
        z.object({
          empty_obj: z.object({}),
          empty_array: z.array(z.any()),
        }),
      );

      expect(result).toEqual({ empty_obj: {}, empty_array: [] });
    });
  });
});
