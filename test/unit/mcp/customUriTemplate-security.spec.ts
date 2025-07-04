import { CustomUriTemplate } from "../../../src/mcp/customResourceTemplate";

describe("CustomUriTemplate - Security & Parameter Validation", () => {
  describe("Unauthorized Parameter Rejection", () => {
    const template = new CustomUriTemplate(
      "odata://CatalogService/books{?filter,orderby,select}",
    );

    it("should reject URIs with unauthorized parameters", () => {
      const unauthorizedUris = [
        "odata://CatalogService/books?filter=test&bingbong=malicious",
        "odata://CatalogService/books?filter=test&admin=true",
        "odata://CatalogService/books?malicious=injection&filter=test",
        "odata://CatalogService/books?bingbong=hack",
        "odata://CatalogService/books?filter=test&orderby=title&unauthorized=value",
        "odata://CatalogService/books?system=rm&filter=test",
        "odata://CatalogService/books?exec=command&select=title",
      ];

      unauthorizedUris.forEach((uri) => {
        const result = template.match(uri);
        expect(result).toBeNull();
      });
    });

    it("should reject URIs with only unauthorized parameters", () => {
      const unauthorizedUris = [
        "odata://CatalogService/books?bingbong=value",
        "odata://CatalogService/books?admin=true&system=hack",
        "odata://CatalogService/books?malicious=injection",
        "odata://CatalogService/books?exec=rm%20-rf%20/",
        "odata://CatalogService/books?unauthorized=parameter",
      ];

      unauthorizedUris.forEach((uri) => {
        const result = template.match(uri);
        expect(result).toBeNull();
      });
    });

    it("should accept URIs with only authorized parameters", () => {
      const authorizedUris = [
        "odata://CatalogService/books?filter=test",
        "odata://CatalogService/books?orderby=title",
        "odata://CatalogService/books?select=title,stock",
        "odata://CatalogService/books?filter=test&orderby=title",
        "odata://CatalogService/books?filter=test&orderby=title&select=title,stock",
      ];

      authorizedUris.forEach((uri) => {
        const result = template.match(uri);
        expect(result).not.toBeNull();
        expect(typeof result).toBe("object");
      });
    });

    it("should reject URIs with mixed authorized and unauthorized parameters", () => {
      const mixedUris = [
        "odata://CatalogService/books?filter=test&bingbong=hack&orderby=title",
        "odata://CatalogService/books?select=title&admin=true",
        "odata://CatalogService/books?filter=test&system=dangerous&orderby=title&malicious=value",
        "odata://CatalogService/books?orderby=title&exec=command",
      ];

      mixedUris.forEach((uri) => {
        const result = template.match(uri);
        expect(result).toBeNull();
      });
    });
  });

  describe("Parameter Name Validation", () => {
    const template = new CustomUriTemplate(
      "odata://CatalogService/books{?filter,top,skip}",
    );

    it("should reject common injection parameter names", () => {
      const injectionParams = [
        "odata://CatalogService/books?filter=test&eval=malicious",
        "odata://CatalogService/books?filter=test&exec=command",
        "odata://CatalogService/books?filter=test&system=hack",
        "odata://CatalogService/books?filter=test&admin=true",
        "odata://CatalogService/books?filter=test&root=access",
        "odata://CatalogService/books?filter=test&cmd=dangerous",
        "odata://CatalogService/books?filter=test&script=injection",
        "odata://CatalogService/books?filter=test&sql=injection",
        "odata://CatalogService/books?filter=test&query=malicious",
      ];

      injectionParams.forEach((uri) => {
        const result = template.match(uri);
        expect(result).toBeNull();
      });
    });

    it("should reject parameters with suspicious naming patterns", () => {
      const suspiciousParams = [
        "odata://CatalogService/books?filter=test&__proto__=hack",
        "odata://CatalogService/books?filter=test&constructor=malicious",
        "odata://CatalogService/books?filter=test&prototype=injection",
        "odata://CatalogService/books?filter=test&__dirname=path",
        "odata://CatalogService/books?filter=test&process=hack",
        "odata://CatalogService/books?filter=test&global=access",
        "odata://CatalogService/books?filter=test&require=module",
      ];

      suspiciousParams.forEach((uri) => {
        const result = template.match(uri);
        expect(result).toBeNull();
      });
    });

    it("should be case-sensitive for parameter names", () => {
      const template = new CustomUriTemplate("odata://Service/entity{?filter}");

      // Should reject uppercase variations
      const caseVariations = [
        "odata://Service/entity?FILTER=test",
        "odata://Service/entity?Filter=test",
        "odata://Service/entity?FILTER=test&filter=valid",
        "odata://Service/entity?fIlTeR=test",
      ];

      caseVariations.forEach((uri) => {
        const result = template.match(uri);
        expect(result).toBeNull();
      });

      // Should accept exact case match
      const validUri = "odata://Service/entity?filter=test";
      const result = template.match(validUri);
      expect(result).not.toBeNull();
      expect(result).toEqual({ filter: "test" });
    });
  });

  describe("Strict Parameter Enforcement", () => {
    it("should reject all parameters when template has no parameters", () => {
      const staticTemplate = new CustomUriTemplate(
        "odata://CatalogService/authors",
      );

      const urisWithParams = [
        "odata://CatalogService/authors?filter=test",
        "odata://CatalogService/authors?any=parameter",
        "odata://CatalogService/authors?bingbong=value",
        "odata://CatalogService/authors?harmless=value",
      ];

      urisWithParams.forEach((uri) => {
        const result = staticTemplate.match(uri);
        expect(result).toBeNull();
      });
    });

    it("should only accept exact parameter matches", () => {
      const template = new CustomUriTemplate(
        "odata://Service/entity{?param1,param2}",
      );

      // Should reject similar but different parameter names
      const similarParams = [
        "odata://Service/entity?param1_extra=value",
        "odata://Service/entity?param1a=value",
        "odata://Service/entity?param11=value",
        "odata://Service/entity?param1&param2&param3=value",
        "odata://Service/entity?param=value", // missing number
        "odata://Service/entity?param1=value&param2=value&extra=unauthorized",
      ];

      similarParams.forEach((uri) => {
        const result = template.match(uri);
        expect(result).toBeNull();
      });
    });

    it("should enforce complete parameter set validation", () => {
      const template = new CustomUriTemplate(
        "odata://Service/entity{?allowed1,allowed2,allowed3}",
      );

      // Any unauthorized parameter should cause complete rejection
      const mixedValidInvalid = [
        "odata://Service/entity?allowed1=good&unauthorized=bad",
        "odata://Service/entity?allowed1=good&allowed2=good&badparam=evil",
        "odata://Service/entity?allowed1=good&allowed2=good&allowed3=good&extra=unauthorized",
      ];

      mixedValidInvalid.forEach((uri) => {
        const result = template.match(uri);
        expect(result).toBeNull();
      });

      // Should accept when all parameters are authorized
      const validUri =
        "odata://Service/entity?allowed1=good&allowed2=good&allowed3=good";
      const result = template.match(validUri);
      expect(result).not.toBeNull();
      expect(result).toEqual({
        allowed1: "good",
        allowed2: "good",
        allowed3: "good",
      });
    });
  });

  describe("Edge Cases for Security", () => {
    const template = new CustomUriTemplate(
      "odata://Service/entity{?filter,select}",
    );

    it("should reject empty parameter names", () => {
      const emptyParamUris = [
        "odata://Service/entity?=value",
        "odata://Service/entity?filter=test&=unauthorized",
        "odata://Service/entity?&filter=test",
        "odata://Service/entity?filter=test&",
      ];

      emptyParamUris.forEach((uri) => {
        const result = template.match(uri);
        // Should either be null (rejected) or should not include empty params
        if (result !== null) {
          expect(result).not.toHaveProperty("");
          expect(Object.keys(result).every((key) => key.length > 0)).toBe(true);
        }
      });
    });

    it("should handle URL-encoded parameter names correctly", () => {
      // URL-encoded parameter names should not bypass validation
      const encodedParams = [
        "odata://Service/entity?filter=test&%62%69%6E%67%62%6F%6E%67=hack", // bingbong encoded
        "odata://Service/entity?filter=test&%61%64%6D%69%6E=true", // admin encoded
        "odata://Service/entity?%65%78%65%63=command&filter=test", // exec encoded
        "odata://Service/entity?filter=test&%73%79%73%74%65%6D=hack", // system encoded
      ];

      encodedParams.forEach((uri) => {
        const result = template.match(uri);
        expect(result).toBeNull();
      });
    });

    it("should reject Unicode and special character parameter names", () => {
      const specialCharParams = [
        "odata://Service/entity?filter=test&би́нгбонг=hack", // Cyrillic
        "odata://Service/entity?filter=test&бингбонг=hack",
        "odata://Service/entity?filter=test&㼀=hack", // Chinese
        "odata://Service/entity?filter=test&🔥=hack", // Emoji
        "odata://Service/entity?filter=test&adminⁿ=hack", // Superscript
        "odata://Service/entity?filter=test&admin‍=hack", // Zero-width joiner
      ];

      specialCharParams.forEach((uri) => {
        const result = template.match(uri);
        expect(result).toBeNull();
      });
    });
  });

  describe("Real-world Attack Scenarios", () => {
    const template = new CustomUriTemplate(
      "odata://CatalogService/books{?filter,orderby,select,top,skip}",
    );

    it("should prevent SQL injection attempts via parameter names", () => {
      const sqlInjectionParams = [
        "odata://CatalogService/books?filter=test&'; DROP TABLE books; --=hack",
        "odata://CatalogService/books?filter=test&UNION SELECT * FROM users=hack",
        "odata://CatalogService/books?filter=test&1' OR '1'='1=hack",
        "odata://CatalogService/books?filter=test&Robert'; DROP TABLE students; --=hack",
      ];

      sqlInjectionParams.forEach((uri) => {
        const result = template.match(uri);
        expect(result).toBeNull();
      });
    });

    it("should prevent NoSQL injection attempts via parameter names", () => {
      const noSqlInjectionParams = [
        "odata://CatalogService/books?filter=test&$where=malicious",
        "odata://CatalogService/books?filter=test&$regex=hack",
        "odata://CatalogService/books?filter=test&$gt=unauthorized",
        "odata://CatalogService/books?filter=test&$lt=hack",
        "odata://CatalogService/books?filter=test&$ne=malicious",
      ];

      noSqlInjectionParams.forEach((uri) => {
        const result = template.match(uri);
        expect(result).toBeNull();
      });
    });

    it("should prevent JavaScript injection attempts via parameter names", () => {
      const jsInjectionParams = [
        "odata://CatalogService/books?filter=test&alert('hack')=malicious",
        "odata://CatalogService/books?filter=test&eval(hack)=injection",
        "odata://CatalogService/books?filter=test&setTimeout=malicious",
        "odata://CatalogService/books?filter=test&document.cookie=hack",
      ];

      jsInjectionParams.forEach((uri) => {
        const result = template.match(uri);
        expect(result).toBeNull();
      });
    });

    it("should prevent path traversal attempts via parameter names", () => {
      const pathTraversalParams = [
        "odata://CatalogService/books?filter=test&../../../etc/passwd=hack",
        "odata://CatalogService/books?filter=test&..\\..\\..\\windows\\system32=hack",
        "odata://CatalogService/books?filter=test&%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd=hack",
      ];

      pathTraversalParams.forEach((uri) => {
        const result = template.match(uri);
        expect(result).toBeNull();
      });
    });

    it("should prevent command injection attempts via parameter names", () => {
      const commandInjectionParams = [
        "odata://CatalogService/books?filter=test&`rm -rf /`=hack",
        "odata://CatalogService/books?filter=test&$(whoami)=hack",
        "odata://CatalogService/books?filter=test&|cat /etc/passwd=hack",
        "odata://CatalogService/books?filter=test&;ls -la=hack",
        "odata://CatalogService/books?filter=test&&ping google.com=hack",
      ];

      commandInjectionParams.forEach((uri) => {
        const result = template.match(uri);
        expect(result).toBeNull();
      });
    });
  });

  describe("Whitelist-only Approach Validation", () => {
    it("should demonstrate whitelist-only security model", () => {
      const template = new CustomUriTemplate(
        "odata://Service/entity{?safe1,safe2}",
      );

      // ONLY these parameters should be allowed
      const allowedParams = ["safe1", "safe2"];

      // Test that ONLY whitelisted parameters work
      const validCombinations = [
        "odata://Service/entity?safe1=value",
        "odata://Service/entity?safe2=value",
        "odata://Service/entity?safe1=value&safe2=value",
        "odata://Service/entity?safe2=value&safe1=value",
      ];

      validCombinations.forEach((uri) => {
        const result = template.match(uri);
        expect(result).not.toBeNull();

        // Verify only allowed parameters are present
        Object.keys(result!).forEach((param) => {
          expect(allowedParams).toContain(param);
        });
      });

      // Test that ANY other parameter causes rejection
      const testUnauthorizedParams = [
        "filter",
        "select",
        "orderby",
        "top",
        "skip", // Common OData params
        "id",
        "name",
        "value",
        "data",
        "content", // Common field names
        "a",
        "b",
        "c",
        "x",
        "y",
        "z", // Single letters
        "param",
        "arg",
        "val",
        "test", // Generic names
        "safe1_",
        "safe2_",
        "_safe1",
        "_safe2", // Similar to allowed
        "safe",
        "safe3",
        "unsafe1",
        "unsafe2", // Variations
      ];

      testUnauthorizedParams.forEach((unauthorizedParam) => {
        const testUri = `odata://Service/entity?safe1=good&${unauthorizedParam}=bad`;
        const result = template.match(testUri);
        expect(result).toBeNull();
      });
    });
  });
});
