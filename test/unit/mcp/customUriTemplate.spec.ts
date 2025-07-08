import { CustomUriTemplate } from "../../../src/mcp/custom-resource-template";

describe("CustomUriTemplate", () => {
  describe("constructor and parsing", () => {
    it("should parse template with grouped query parameters", () => {
      const template = new CustomUriTemplate(
        "odata://CatalogService/books{?filter,orderby,select,skip,top}",
      );

      expect(template.toString()).toBe(
        "odata://CatalogService/books{?filter,orderby,select,skip,top}",
      );
      expect(template.variableNames).toEqual([
        "filter",
        "orderby",
        "select",
        "skip",
        "top",
      ]);
    });

    it("should parse template with single query parameter", () => {
      const template = new CustomUriTemplate(
        "odata://CatalogService/books{?filter}",
      );

      expect(template.toString()).toBe("odata://CatalogService/books{?filter}");
      expect(template.variableNames).toEqual(["filter"]);
    });

    it("should parse static template without parameters", () => {
      const template = new CustomUriTemplate("odata://CatalogService/books");

      expect(template.toString()).toBe("odata://CatalogService/books");
      expect(template.variableNames).toEqual([]);
    });

    it("should handle template with spaces in parameter names", () => {
      const template = new CustomUriTemplate(
        "odata://Service/entity{?param1, param2 , param3}",
      );

      expect(template.variableNames).toEqual(["param1", "param2", "param3"]);
    });

    it("should handle empty parameter list", () => {
      const template = new CustomUriTemplate("odata://Service/entity{?}");

      expect(template.variableNames).toEqual([]);
    });
  });

  describe("match method", () => {
    describe("with grouped parameters", () => {
      const template = new CustomUriTemplate(
        "odata://CatalogService/books{?filter,orderby,select,skip,top}",
      );

      it("should match URI with all parameters", () => {
        const uri =
          "odata://CatalogService/books?filter=title%20eq%20%27It%27&orderby=title%20desc&select=title%2Cstock&top=1&skip=0";
        const result = template.match(uri);

        expect(result).toEqual({
          filter: "title eq 'It'",
          orderby: "title desc",
          select: "title,stock",
          top: "1",
          skip: "0",
        });
      });

      it("should match URI with partial parameters", () => {
        const uri =
          "odata://CatalogService/books?filter=title%20eq%20%27It%27&top=5";
        const result = template.match(uri);

        expect(result).toEqual({
          filter: "title eq 'It'",
          top: "5",
        });
      });

      it("should match URI with single parameter", () => {
        const uri = "odata://CatalogService/books?filter=stock%20gt%2010";
        const result = template.match(uri);

        expect(result).toEqual({
          filter: "stock gt 10",
        });
      });

      it("should match URI without query parameters", () => {
        const uri = "odata://CatalogService/books";
        const result = template.match(uri);

        expect(result).toEqual({});
      });

      it("should reject URIs with unauthorized parameters", () => {
        const uri =
          "odata://CatalogService/books?filter=title%20eq%20%27It%27&unknown=value&top=5";
        const result = template.match(uri);

        expect(result).toBeNull(); // Should reject due to unauthorized 'unknown' parameter
      });

      it("should handle parameters with special characters", () => {
        const uri =
          "odata://CatalogService/books?filter=title%20eq%20%27Test%26Special%27";
        const result = template.match(uri);

        expect(result).toEqual({
          filter: "title eq 'Test&Special'",
        });
      });

      it("should handle parameters with empty values", () => {
        const uri = "odata://CatalogService/books?filter=&top=5";
        const result = template.match(uri);

        expect(result).toEqual({
          filter: "",
          top: "5",
        });
      });
    });

    describe("with static template", () => {
      const template = new CustomUriTemplate("odata://CatalogService/authors");

      it("should match exact static URI", () => {
        const uri = "odata://CatalogService/authors";
        const result = template.match(uri);

        expect(result).toEqual({});
      });

      it("should reject static URI with any query parameters", () => {
        const uri = "odata://CatalogService/authors?unknown=value";
        const result = template.match(uri);

        expect(result).toBeNull(); // Should reject any parameters for static templates
      });
    });

    describe("non-matching cases", () => {
      const template = new CustomUriTemplate(
        "odata://CatalogService/books{?filter,top}",
      );

      it("should return null for different base URI", () => {
        const uri = "odata://CatalogService/authors?filter=test";
        const result = template.match(uri);

        expect(result).toBeNull();
      });

      it("should return null for different protocol", () => {
        const uri = "http://CatalogService/books?filter=test";
        const result = template.match(uri);

        expect(result).toBeNull();
      });

      it("should return null for different service", () => {
        const uri = "odata://OtherService/books?filter=test";
        const result = template.match(uri);

        expect(result).toBeNull();
      });

      it("should return null for different entity", () => {
        const uri = "odata://CatalogService/authors?filter=test";
        const result = template.match(uri);

        expect(result).toBeNull();
      });
    });
  });

  describe("expand method", () => {
    describe("with grouped parameters", () => {
      const template = new CustomUriTemplate(
        "odata://CatalogService/books{?filter,orderby,select,skip,top}",
      );

      it("should expand with all parameters", () => {
        const variables = {
          filter: "title eq 'It'",
          orderby: "title desc",
          select: "title,stock",
          skip: "0",
          top: "1",
        };

        const result = template.expand(variables);
        expect(result).toBe(
          "odata://CatalogService/books?filter=title%20eq%20'It'&orderby=title%20desc&select=title%2Cstock&skip=0&top=1",
        );
      });

      it("should expand with partial parameters", () => {
        const variables = {
          filter: "stock gt 10",
          top: "5",
        };

        const result = template.expand(variables);
        expect(result).toBe(
          "odata://CatalogService/books?filter=stock%20gt%2010&top=5",
        );
      });

      it("should expand with single parameter", () => {
        const variables = {
          filter: "title eq 'Test'",
        };

        const result = template.expand(variables);
        expect(result).toBe(
          "odata://CatalogService/books?filter=title%20eq%20'Test'",
        );
      });

      it("should return base URI when no parameters provided", () => {
        const variables = {};

        const result = template.expand(variables);
        expect(result).toBe("odata://CatalogService/books");
      });

      it("should skip undefined, null, and empty string values", () => {
        const variables: Record<string, any> = {
          filter: "title eq 'Test'",
          orderby: undefined,
          select: null,
          skip: "",
          top: "5",
        };

        const result = template.expand(variables);
        expect(result).toBe(
          "odata://CatalogService/books?filter=title%20eq%20'Test'&top=5",
        );
      });

      it("should handle special characters in parameter values", () => {
        const variables = {
          filter: "title eq 'Test & Special'",
        };

        const result = template.expand(variables);
        expect(result).toBe(
          "odata://CatalogService/books?filter=title%20eq%20'Test%20%26%20Special'",
        );
      });
    });

    describe("with static template", () => {
      const template = new CustomUriTemplate("odata://CatalogService/authors");

      it("should return base URI regardless of variables", () => {
        const variables = {
          filter: "name eq 'Test'",
          top: "5",
        };

        const result = template.expand(variables);
        expect(result).toBe("odata://CatalogService/authors");
      });
    });
  });

  describe("round-trip consistency", () => {
    const template = new CustomUriTemplate(
      "odata://CatalogService/books{?filter,orderby,select,skip,top}",
    );

    it("should maintain consistency between expand and match", () => {
      const originalVars = {
        filter: "title eq 'Test'",
        orderby: "title desc",
        select: "title,stock",
        top: "5",
      };

      const expandedUri = template.expand(originalVars);
      const matchedVars = template.match(expandedUri);

      expect(matchedVars).toEqual(originalVars);
    });

    it("should handle complex OData expressions", () => {
      const originalVars = {
        filter: "contains(title,'Harry') and stock gt 10",
        orderby: "title asc, stock desc",
        select: "ID,title,stock,author/name",
      };

      const expandedUri = template.expand(originalVars);
      const matchedVars = template.match(expandedUri);

      expect(matchedVars).toEqual(originalVars);
    });
  });

  describe("edge cases and error handling", () => {
    it("should reject malformed query strings", () => {
      const template = new CustomUriTemplate("odata://Service/entity{?param}");

      // Missing value - should be rejected
      let result = template.match("odata://Service/entity?param");
      expect(result).toBeNull();

      // Missing key - should be rejected
      result = template.match("odata://Service/entity?=value");
      expect(result).toBeNull();

      // Multiple equals signs - should preserve everything after first =
      result = template.match("odata://Service/entity?param=value=extra");
      expect(result).toEqual({ param: "value=extra" });
    });

    it("should handle empty template gracefully", () => {
      const template = new CustomUriTemplate("");

      expect(template.variableNames).toEqual([]);
      expect(template.match("")).toEqual({});
      expect(template.expand({})).toBe("");
    });

    it("should handle very long parameter values", () => {
      const template = new CustomUriTemplate("odata://Service/entity{?param}");
      const longValue = "a".repeat(1000);

      const expanded = template.expand({ param: longValue });
      const matched = template.match(expanded);

      expect(matched).toEqual({ param: longValue });
    });
  });
});
