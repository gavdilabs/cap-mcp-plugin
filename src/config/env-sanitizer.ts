import { LOGGER } from "../logger";

/**
 * Dangerous characters that could be used for injection attacks
 */
const DANGEROUS_CHARS = /[;&|`$()<>!]/g;

/**
 * Validation patterns for specific environment variables
 */
const VALIDATION_PATTERNS = {
  npm_package_name: /^[a-zA-Z0-9\-_@/\.]+$/,
  npm_package_version:
    /^\d+\.\d+\.\d+(-[a-zA-Z0-9\-\.]+)?(\+[a-zA-Z0-9\-\.]+)?$/,
  NODE_ENV: /^(development|production|test)$/,
} as const;

/**
 * Sanitizes environment variable value by removing dangerous characters
 * @param value - Raw environment variable value
 * @param key - Environment variable key for logging
 * @returns Sanitized value with dangerous characters removed
 */
function sanitizeValue(value: string, key: string): string {
  const originalValue = value;
  const sanitized = value.replace(DANGEROUS_CHARS, "").trim();

  if (sanitized !== originalValue) {
    LOGGER.warn(
      `Environment variable '${key}' contained potentially dangerous characters and was sanitized`,
    );
  }

  return sanitized;
}

/**
 * Validates environment variable value against expected pattern
 * @param value - Sanitized environment variable value
 * @param key - Environment variable key
 * @returns True if valid, false otherwise
 */
function validateValue(
  value: string,
  key: keyof typeof VALIDATION_PATTERNS,
): boolean {
  const pattern = VALIDATION_PATTERNS[key];
  if (!pattern) return true; // No validation pattern defined

  const isValid = pattern.test(value);
  if (!isValid) {
    LOGGER.warn(
      `Environment variable '${key}' value '${value}' does not match expected pattern`,
    );
  }

  return isValid;
}

/**
 * Safely retrieves and sanitizes an environment variable
 * @param key - Environment variable key
 * @param defaultValue - Default value if environment variable is not set or invalid
 * @returns Sanitized environment variable value or default
 */
export function getSafeEnvVar(key: string, defaultValue: string = ""): string {
  const rawValue = process.env[key];

  // Return default if not set or empty
  if (!rawValue || rawValue.trim().length === 0) {
    return defaultValue;
  }

  // Sanitize the value
  const sanitized = sanitizeValue(rawValue, key);

  // Validate if pattern exists
  if (key in VALIDATION_PATTERNS) {
    const isValid = validateValue(
      sanitized,
      key as keyof typeof VALIDATION_PATTERNS,
    );
    if (!isValid) {
      LOGGER.warn(
        `Using default value for invalid environment variable '${key}'`,
      );
      return defaultValue;
    }
  }

  return sanitized;
}

/**
 * Checks if current environment is test
 * @returns True if NODE_ENV is 'test'
 */
export function isTestEnvironment(): boolean {
  return getSafeEnvVar("NODE_ENV", "development") === "test";
}
