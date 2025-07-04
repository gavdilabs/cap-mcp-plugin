import {
  CustomResourceTemplate,
  CustomUriTemplate,
} from "../../../src/mcp/customResourceTemplate";

describe("CustomResourceTemplate", () => {
  describe("constructor", () => {
    it("should create template with string URI template", () => {
      const callbacks = { list: undefined };
      const template = new CustomResourceTemplate(
        "odata://Service/entity{?param1,param2}",
        callbacks,
      );

      expect(template.uriTemplate).toBeInstanceOf(CustomUriTemplate);
      expect(template.uriTemplate.toString()).toBe(
        "odata://Service/entity{?param1,param2}",
      );
      expect(template.listCallback).toBeUndefined();
    });

    it("should store callbacks correctly", () => {
      const callbacks = {
        list: jest.fn(),
        complete: {
          param1: jest.fn(),
          param2: jest.fn(),
        },
      };
      const template = new CustomResourceTemplate(
        "odata://Service/entity{?param1,param2}",
        callbacks,
      );

      expect(template.listCallback).toBe(callbacks.list);
      expect(template.completeCallback("param1")).toBe(
        callbacks.complete.param1,
      );
      expect(template.completeCallback("param2")).toBe(
        callbacks.complete.param2,
      );
    });
  });

  describe("uriTemplate property", () => {
    it("should return the CustomUriTemplate instance", () => {
      const template = new CustomResourceTemplate(
        "odata://Service/entity{?param}",
        { list: undefined },
      );
      const uriTemplate = template.uriTemplate;

      expect(uriTemplate).toBeInstanceOf(CustomUriTemplate);
      expect(uriTemplate.toString()).toBe("odata://Service/entity{?param}");
    });

    it("should allow access to URI template methods", () => {
      const template = new CustomResourceTemplate(
        "odata://Service/entity{?filter,top}",
        { list: undefined },
      );
      const uriTemplate = template.uriTemplate;

      // Test that URI template methods are accessible
      expect(uriTemplate.variableNames).toEqual(["filter", "top"]);

      const matchResult = uriTemplate.match(
        "odata://Service/entity?filter=test&top=5",
      );
      expect(matchResult).toEqual({ filter: "test", top: "5" });

      const expandResult = uriTemplate.expand({ filter: "test", top: "10" });
      expect(expandResult).toBe("odata://Service/entity?filter=test&top=10");
    });
  });

  describe("listCallback property", () => {
    it("should return undefined when no list callback provided", () => {
      const template = new CustomResourceTemplate(
        "odata://Service/entity{?param}",
        { list: undefined },
      );

      expect(template.listCallback).toBeUndefined();
    });

    it("should return the list callback when provided", () => {
      const listCallback = jest.fn();
      const template = new CustomResourceTemplate(
        "odata://Service/entity{?param}",
        { list: listCallback },
      );

      expect(template.listCallback).toBe(listCallback);
    });

    it("should return null when explicitly set to null", () => {
      const template = new CustomResourceTemplate(
        "odata://Service/entity{?param}",
        { list: null },
      );

      expect(template.listCallback).toBeNull();
    });
  });

  describe("completeCallback method", () => {
    it("should return undefined when no complete callbacks provided", () => {
      const template = new CustomResourceTemplate(
        "odata://Service/entity{?param}",
        { list: undefined },
      );

      expect(template.completeCallback("param")).toBeUndefined();
      expect(template.completeCallback("nonexistent")).toBeUndefined();
    });

    it("should return undefined when complete is undefined", () => {
      const template = new CustomResourceTemplate(
        "odata://Service/entity{?param}",
        {
          list: undefined,
          complete: undefined,
        },
      );

      expect(template.completeCallback("param")).toBeUndefined();
    });

    it("should return the correct callback for existing variables", () => {
      const filterCallback = jest.fn();
      const topCallback = jest.fn();
      const callbacks = {
        list: undefined,
        complete: {
          filter: filterCallback,
          top: topCallback,
        },
      };
      const template = new CustomResourceTemplate(
        "odata://Service/entity{?filter,top}",
        callbacks,
      );

      expect(template.completeCallback("filter")).toBe(filterCallback);
      expect(template.completeCallback("top")).toBe(topCallback);
    });

    it("should return undefined for non-existent variables", () => {
      const callbacks = {
        list: undefined,
        complete: {
          filter: jest.fn(),
        },
      };
      const template = new CustomResourceTemplate(
        "odata://Service/entity{?filter,top}",
        callbacks,
      );

      expect(template.completeCallback("nonexistent")).toBeUndefined();
      expect(template.completeCallback("top")).toBeUndefined();
    });

    it("should handle empty complete object", () => {
      const callbacks = {
        list: undefined,
        complete: {},
      };
      const template = new CustomResourceTemplate(
        "odata://Service/entity{?param}",
        callbacks,
      );

      expect(template.completeCallback("param")).toBeUndefined();
    });
  });

  describe("MCP SDK compatibility", () => {
    it("should have all required interface properties", () => {
      const template = new CustomResourceTemplate(
        "odata://Service/entity{?param}",
        { list: undefined },
      );

      // Check that all required properties exist
      expect(template).toHaveProperty("uriTemplate");
      expect(template).toHaveProperty("listCallback");
      expect(typeof template.completeCallback).toBe("function");
    });

    it("should match expected interface structure", () => {
      const listCallback = jest.fn();
      const completeCallback = jest.fn();
      const callbacks = {
        list: listCallback,
        complete: {
          param: completeCallback,
        },
      };
      const template = new CustomResourceTemplate(
        "odata://Service/entity{?param}",
        callbacks,
      );

      // Verify interface compatibility
      expect(template.uriTemplate).toBeInstanceOf(CustomUriTemplate);
      expect(template.listCallback).toBe(listCallback);
      expect(template.completeCallback("param")).toBe(completeCallback);
    });
  });

  describe("real-world usage scenarios", () => {
    it("should handle CAP CDS service resource template", () => {
      const callbacks = { list: undefined };
      const template = new CustomResourceTemplate(
        "odata://CatalogService/books{?filter,orderby,select,skip,top}",
        callbacks,
      );

      expect(template.uriTemplate.variableNames).toEqual([
        "filter",
        "orderby",
        "select",
        "skip",
        "top",
      ]);

      // Test realistic OData query
      const testUri =
        "odata://CatalogService/books?filter=contains(title,'Harry')&orderby=title%20asc&select=title,stock&top=10&skip=0";
      const result = template.uriTemplate.match(testUri);

      expect(result).toEqual({
        filter: "contains(title,'Harry')",
        orderby: "title asc",
        select: "title,stock",
        top: "10",
        skip: "0",
      });
    });

    it("should handle static resource template", () => {
      const callbacks = { list: undefined };
      const template = new CustomResourceTemplate(
        "odata://CatalogService/authors",
        callbacks,
      );

      expect(template.uriTemplate.variableNames).toEqual([]);

      const result = template.uriTemplate.match(
        "odata://CatalogService/authors",
      );
      expect(result).toEqual({});
    });

    it("should support completion callbacks for OData parameters", () => {
      const filterCompleter = jest.fn();
      const orderbyCompleter = jest.fn();
      const selectCompleter = jest.fn();

      const callbacks = {
        list: undefined,
        complete: {
          filter: filterCompleter,
          orderby: orderbyCompleter,
          select: selectCompleter,
        },
      };

      const template = new CustomResourceTemplate(
        "odata://CatalogService/books{?filter,orderby,select,skip,top}",
        callbacks,
      );

      expect(template.completeCallback("filter")).toBe(filterCompleter);
      expect(template.completeCallback("orderby")).toBe(orderbyCompleter);
      expect(template.completeCallback("select")).toBe(selectCompleter);
      expect(template.completeCallback("skip")).toBeUndefined();
      expect(template.completeCallback("top")).toBeUndefined();
    });
  });

  describe("integration with CustomUriTemplate", () => {
    it("should properly delegate URI operations to CustomUriTemplate", () => {
      const template = new CustomResourceTemplate(
        "test://service/entity{?param1,param2}",
        { list: undefined },
      );
      const uriTemplate = template.uriTemplate;

      // Mock the CustomUriTemplate methods to verify delegation
      jest.spyOn(uriTemplate, "match");
      jest.spyOn(uriTemplate, "expand");

      // Call methods through the template
      const testUri = "test://service/entity?param1=value1&param2=value2";
      uriTemplate.match(testUri);
      uriTemplate.expand({ param1: "value1", param2: "value2" });

      expect(uriTemplate.match).toHaveBeenCalledWith(testUri);
      expect(uriTemplate.expand).toHaveBeenCalledWith({
        param1: "value1",
        param2: "value2",
      });
    });
  });
});
