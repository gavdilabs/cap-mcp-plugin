/**
 * Unit tests for ISO 8601 date/time validation in determineMcpParameterType
 *
 * These tests verify that the Zod schemas returned by determineMcpParameterType
 * correctly accept ISO 8601 date strings (the standard format used by AI agents)
 * in addition to other valid formats.
 *
 * Related issue: https://github.com/gavdilabs/cap-mcp-plugin/issues/102
 */

// Set up global.cds BEFORE importing the module
(global as any).cds = {
  model: { definitions: {} },
  test: jest.fn().mockResolvedValue(undefined),
  services: {},
  connect: { to: jest.fn() },
  User: {
    privileged: { id: "privileged", name: "Privileged User" },
    anonymous: { id: "anonymous", _is_anonymous: true },
  },
  context: { user: null },
};

// Import the actual function (not mocked) to test real Zod validation behavior
import { determineMcpParameterType } from "../../../src/mcp/utils";

describe("ISO 8601 Date Validation - determineMcpParameterType", () => {
  describe("Date type", () => {
    it("should accept ISO 8601 date string (YYYY-MM-DD)", () => {
      const schema = determineMcpParameterType("Date");
      const result = schema.safeParse("2026-01-06");

      expect(result.success).toBe(true);
    });

    it("should accept ISO 8601 datetime string for Date type", () => {
      const schema = determineMcpParameterType("Date");
      const result = schema.safeParse("2026-01-06T00:00:00Z");

      expect(result.success).toBe(true);
    });

    it("should reject invalid date strings", () => {
      const schema = determineMcpParameterType("Date");
      const result = schema.safeParse("not-a-valid-date");

      expect(result.success).toBe(false);
    });

    it("should reject empty strings", () => {
      const schema = determineMcpParameterType("Date");
      const result = schema.safeParse("");

      expect(result.success).toBe(false);
    });
  });

  describe("DateTime type", () => {
    it("should accept ISO 8601 datetime string with timezone offset", () => {
      const schema = determineMcpParameterType("DateTime");
      const result = schema.safeParse("2026-01-06T16:04:43+08:00");

      expect(result.success).toBe(true);
    });

    it("should accept ISO 8601 datetime string with Z suffix (UTC)", () => {
      const schema = determineMcpParameterType("DateTime");
      const result = schema.safeParse("2026-01-06T16:04:43Z");

      expect(result.success).toBe(true);
    });

    it("should accept ISO 8601 datetime string without timezone", () => {
      const schema = determineMcpParameterType("DateTime");
      const result = schema.safeParse("2026-01-06T16:04:43");

      expect(result.success).toBe(true);
    });

    it("should accept ISO 8601 date-only string for DateTime", () => {
      const schema = determineMcpParameterType("DateTime");
      const result = schema.safeParse("2026-01-06");

      expect(result.success).toBe(true);
    });

    it("should reject invalid datetime strings", () => {
      const schema = determineMcpParameterType("DateTime");
      const result = schema.safeParse("invalid-datetime");

      expect(result.success).toBe(false);
    });
  });

  describe("Time type", () => {
    // Note: z.coerce.date() requires a full date string, not just time.
    // AI agents typically send full ISO datetime strings even for Time fields.

    it("should accept full ISO datetime string for Time type", () => {
      const schema = determineMcpParameterType("Time");
      // AI agents send full datetime even for time fields
      const result = schema.safeParse("2026-01-06T16:04:43Z");

      expect(result.success).toBe(true);
    });

    it("should accept ISO datetime with timezone for Time type", () => {
      const schema = determineMcpParameterType("Time");
      const result = schema.safeParse("2026-01-06T16:04:43+08:00");

      expect(result.success).toBe(true);
    });

    it("should reject invalid time strings", () => {
      const schema = determineMcpParameterType("Time");
      const result = schema.safeParse("not-a-time");

      expect(result.success).toBe(false);
    });

    it("should reject time-only strings (require full datetime)", () => {
      const schema = determineMcpParameterType("Time");
      // Time-only strings don't parse with z.coerce.date()
      // AI agents should send full ISO datetime strings
      const result = schema.safeParse("16:04:43");

      expect(result.success).toBe(false);
    });
  });

  describe("Timestamp type", () => {
    it("should accept ISO 8601 datetime string with milliseconds", () => {
      const schema = determineMcpParameterType("Timestamp");
      const result = schema.safeParse("2026-01-06T16:04:43.123Z");

      expect(result.success).toBe(true);
    });

    it("should accept ISO 8601 datetime string without milliseconds", () => {
      const schema = determineMcpParameterType("Timestamp");
      const result = schema.safeParse("2026-01-06T16:04:43Z");

      expect(result.success).toBe(true);
    });

    it("should accept epoch milliseconds as number", () => {
      const schema = determineMcpParameterType("Timestamp");
      const result = schema.safeParse(1736159083000);

      expect(result.success).toBe(true);
    });

    it("should reject invalid timestamp strings", () => {
      const schema = determineMcpParameterType("Timestamp");
      const result = schema.safeParse("not-a-timestamp");

      expect(result.success).toBe(false);
    });
  });

  describe("Array types with dates", () => {
    it("should accept array of ISO 8601 date strings for DateArray", () => {
      const schema = determineMcpParameterType("DateArray");
      const result = schema.safeParse(["2026-01-06", "2026-01-07"]);

      expect(result.success).toBe(true);
    });

    it("should accept array of ISO 8601 datetime strings for DateTimeArray", () => {
      const schema = determineMcpParameterType("DateTimeArray");
      const result = schema.safeParse([
        "2026-01-06T16:04:43Z",
        "2026-01-07T10:00:00+08:00",
      ]);

      expect(result.success).toBe(true);
    });

    it("should accept array of ISO 8601 datetime strings for TimeArray", () => {
      const schema = determineMcpParameterType("TimeArray");
      // AI agents send full datetime strings even for time fields
      const result = schema.safeParse([
        "2026-01-06T16:04:43Z",
        "2026-01-06T10:00:00Z",
      ]);

      expect(result.success).toBe(true);
    });

    it("should accept array of ISO 8601 timestamp strings for TimestampArray", () => {
      const schema = determineMcpParameterType("TimestampArray");
      const result = schema.safeParse([
        "2026-01-06T16:04:43.123Z",
        "2026-01-07T10:00:00.456Z",
      ]);

      expect(result.success).toBe(true);
    });

    it("should accept mixed array with epoch and ISO strings for TimestampArray", () => {
      const schema = determineMcpParameterType("TimestampArray");
      const result = schema.safeParse([
        1736159083000,
        "2026-01-07T10:00:00.456Z",
      ]);

      expect(result.success).toBe(true);
    });

    it("should reject array with invalid date strings", () => {
      const schema = determineMcpParameterType("DateArray");
      const result = schema.safeParse(["2026-01-06", "invalid-date"]);

      expect(result.success).toBe(false);
    });
  });

  describe("Edge cases", () => {
    it("should handle ISO 8601 with negative timezone offset", () => {
      const schema = determineMcpParameterType("DateTime");
      const result = schema.safeParse("2026-01-06T16:04:43-05:00");

      expect(result.success).toBe(true);
    });

    it("should handle ISO 8601 with microsecond precision", () => {
      const schema = determineMcpParameterType("Timestamp");
      const result = schema.safeParse("2026-01-06T16:04:43.123456Z");

      expect(result.success).toBe(true);
    });

    it("should handle minimum valid date", () => {
      const schema = determineMcpParameterType("Date");
      const result = schema.safeParse("0001-01-01");

      expect(result.success).toBe(true);
    });

    it("should handle leap year date", () => {
      const schema = determineMcpParameterType("Date");
      const result = schema.safeParse("2024-02-29");

      expect(result.success).toBe(true);
    });
  });
});
