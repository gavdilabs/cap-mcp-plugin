import { parseDefinitions } from "../../../src/annotations/parser";
import { csn } from "@sap/cds";

jest.mock("../../../src/logger", () => ({
  LOGGER: {
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockCsn: csn.CSN = {
  definitions: {
    CatalogService: {
      kind: "service",
      "@mcp.prompts": [
        {
          name: "give-me-book-abstract",
          title: "Book Abstract",
          description: "Gives an abstract of a book based on the title",
          template:
            "Search the internet and give me an abstract of the book {{book-id}}",
          role: "user",
          inputs: [{ key: "book-id", type: "String" }],
        },
      ],
    },
    "CatalogService.Books": {
      kind: "entity",
      "@mcp.name": "books",
      "@mcp.description": "Book data list",
      "@mcp.resource": ["filter", "orderby", "select", "skip", "top"],
      "@mcp.wrap.tools": true,
      "@mcp.wrap.modes": ["query", "get", "create", "update", "delete"],
      "@mcp.wrap.hint": "Use for read and write demo operations",
      elements: {
        ID: {
          "@mcp.hint": "Must be a unique number not already in the system",
          key: true,
          type: "cds.Integer",
        },
        title: { type: "cds.String" },
        stock: {
          "@mcp.hint": "The amount of books currently on store shelves",
          type: "cds.Integer",
        },
        computedValue: { "@Core.Computed": true, type: "cds.Integer" },
        author: {
          type: "cds.Association",
          target: "CatalogService.Authors",
          keys: [{ ref: ["ID"], $generatedFieldName: "author_ID" }],
        },
        author_ID: { type: "cds.Integer", "@odata.foreignKey4": "author" },
      },
      actions: {
        getStock: {
          kind: "function",
          "@mcp.name": "get-stock",
          "@mcp.description": "Retrieves stock from a given book",
          "@mcp.tool": true,
          returns: { type: "cds.Integer" },
        },
      },
      projection: { from: { ref: ["my.bookshop.Books"] } },
    },
    "my.bookshop.Books": {
      kind: "entity",
      elements: {
        ID: {
          "@mcp.hint": "Must be a unique number not already in the system",
          key: true,
          type: "cds.Integer",
        },
        title: { type: "cds.String" },
        stock: {
          "@mcp.hint": "The amount of books currently on store shelves",
          type: "cds.Integer",
        },
        computedValue: { "@Core.Computed": true, type: "cds.Integer" },
        author: {
          type: "cds.Association",
          target: "my.bookshop.Authors",
          keys: [{ ref: ["ID"], $generatedFieldName: "author_ID" }],
        },
        author_ID: { type: "cds.Integer", "@odata.foreignKey4": "author" },
      },
    },
    "my.bookshop.Authors": {
      kind: "entity",
      elements: {
        ID: { key: true, type: "cds.Integer" },
        name: {
          "@mcp.hint": "Full name of the author",
          type: "cds.String",
        },
        books: {
          type: "cds.Association",
          cardinality: { max: "*" },
          target: "my.bookshop.Books",
          on: [{ ref: ["books", "author"] }, "=", { ref: ["$self"] }],
        },
        nominations: {
          "@mcp.hint": "Awards that the author has been nominated for",
          items: { type: "cds.String" },
        },
      },
    },
    "CatalogService.Authors": {
      kind: "entity",
      "@mcp.name": "authors",
      "@mcp.description": "Author data list",
      "@mcp.resource": true,
      "@mcp.wrap.tools": true,
      "@mcp.wrap.modes": ["query", "get", "create", "update"],
      "@mcp.wrap.hint.query":
        "Retrieves lists of data based on the query parameters provided",
      "@mcp.wrap.hint.get": "Retrieves a singular entity",
      "@mcp.wrap.hint.create": "Creates a new record of an Author",
      "@mcp.wrap.hint.update": "Update properties of a given author",
      elements: {
        ID: { key: true, type: "cds.Integer" },
        name: {
          "@mcp.hint": "Full name of the author",
          type: "cds.String",
        },
        books: {
          type: "cds.Association",
          cardinality: { max: "*" },
          target: "CatalogService.Books",
          on: [{ ref: ["books", "author"] }, "=", { ref: ["$self"] }],
        },
        nominations: {
          "@mcp.hint": "Awards that the author has been nominated for",
          items: { type: "cds.String" },
        },
      },
      projection: { from: { ref: ["my.bookshop.Authors"] } },
    },
    "CatalogService.MultiKeyExamples": {
      kind: "entity",
      "@restrict": [
        { grant: ["READ"], to: ["read-role"] },
        { grant: ["CREATE", "UPDATE"], to: ["maintainer"] },
        { grant: ["*"], to: ["admin"] },
      ],
      elements: {
        ID: { key: true, type: "cds.Integer" },
        ExternalKey: { key: true, type: "cds.Integer" },
        description: { type: "cds.String" },
      },
      actions: {
        getMultiKey: {
          kind: "function",
          "@mcp.name": "get-multi-key",
          "@mcp.description": "Gets multi key entity from database",
          "@mcp.tool": true,
          returns: { type: "cds.String" },
        },
      },
      projection: { from: { ref: ["my.bookshop.MultiKeyExample"] } },
    },
    "my.bookshop.MultiKeyExample": {
      kind: "entity",
      elements: {
        ID: { key: true, type: "cds.Integer" },
        ExternalKey: { key: true, type: "cds.Integer" },
        description: { type: "cds.String" },
      },
    },
    "CatalogService.getAuthor": {
      kind: "function",
      "@mcp.name": "get-author",
      "@mcp.description": "Gets the desired author",
      "@mcp.tool": true,
      "@mcp.elicit": ["input"],
      "@requires": "book-keeper",
      params: { id: { type: "cds.String" } },
      returns: { type: "cds.String" },
    },
    "CatalogService.getAuthorDetails": {
      kind: "function",
      "@requires": "author-specialist",
      "@mcp.name": "get-author-details",
      "@mcp.description": "Gets the desired authors details",
      "@mcp.tool": true,
      returns: { type: "cds.String" },
    },
    "CatalogService.getBooksByAuthor": {
      kind: "function",
      "@mcp.name": "books-by-author",
      "@mcp.description": "Gets a list of books made by the author",
      "@mcp.tool": true,
      "@mcp.elicit": ["input", "confirm"],
      params: {
        authorName: {
          "@mcp.hint": "Full name of the author you want to get the books of",
          type: "cds.String",
        },
      },
      returns: { items: { type: "cds.String" } },
    },
    "CatalogService.getBookRecommendation": {
      kind: "function",
      "@mcp.name": "book-recommendation",
      "@mcp.description": "Get a random book recommendation",
      "@mcp.tool": true,
      returns: { type: "cds.String" },
    },
    "CatalogService.getManyAuthors": {
      kind: "function",
      "@mcp.name": "get-many-authors",
      "@mcp.description": 'Gets many authors. Using for testing "many"',
      "@mcp.tool": true,
      params: {
        ids: { items: { type: "cds.String" } },
      },
      returns: { items: { type: "cds.String" } },
    },
    "CatalogService.checkAuthorName": {
      kind: "function",
      "@mcp.name": "check-author-name",
      "@mcp.description": "Not implemented, just a test for parser",
      "@mcp.tool": true,
      params: {
        value: {
          "@assert.range": [0, 10],
          type: "cds.Integer",
          "@Validation.Minimum": 0,
          "@Validation.Maximum": 10,
        },
      },
      returns: { type: "cds.String" },
    },
    "my.bookshop.ComplexType": {
      kind: "type",
      elements: {
        rangedNumber: {
          "@assert.range": [0, 10],
          type: "cds.Integer",
          "@Validation.Minimum": 0,
          "@Validation.Maximum": 10,
        },
      },
    },
    "CatalogService.getNotReal": {
      kind: "function",
      "@mcp.name": "not-real-tool",
      "@mcp.description": "Not real, just used for nested types. Do not use",
      "@mcp.tool": true,
      params: {
        value: {
          "@assert.range": [0, { "=": "_" }],
          "@mcp.hint":
            "Only takes in positive numbers, i.e. no negative values such as -1",
          type: "cds.Integer",
          "@Validation.Minimum": 0,
        },
      },
      returns: { type: "cds.String" },
    },
    "my.bookshop.TValidQuantities": {
      kind: "type",
      elements: {
        positiveOnly: {
          "@assert.range": [0, { "=": "_" }],
          "@mcp.hint":
            "Only takes in positive numbers, i.e. no negative values such as -1",
          type: "cds.Integer",
          "@Validation.Minimum": 0,
        },
      },
    },
    "my.bookshop.TMyNumbers": {
      kind: "type",
      elements: { anInteger: { type: "cds.Integer" } },
    },
    AdminService: { kind: "service" },
    "AdminService.Books": {
      kind: "entity",
      "@mcp.name": "admin-books",
      "@mcp.description": "Book data list",
      "@mcp.resource": ["filter", "orderby", "select", "skip", "top"],
      elements: {
        ID: {
          "@mcp.hint": "Must be a unique number not already in the system",
          key: true,
          type: "cds.Integer",
        },
        title: { type: "cds.String" },
        stock: {
          "@mcp.hint": "The amount of books currently on store shelves",
          type: "cds.Integer",
        },
        computedValue: { "@Core.Computed": true, type: "cds.Integer" },
        author: {
          type: "cds.Association",
          target: "my.bookshop.Authors",
          keys: [{ ref: ["ID"], $generatedFieldName: "author_ID" }],
        },
        author_ID: { type: "cds.Integer", "@odata.foreignKey4": "author" },
      },
      actions: {
        getStock: {
          kind: "function",
          "@mcp.name": "get-stock-as-admin",
          "@mcp.description": "Retrieves stock from a given book",
          "@mcp.tool": true,
          returns: { type: "cds.Integer" },
        },
      },
      projection: { from: { ref: ["my.bookshop.Books"] } },
    },
    "AdminService.getBookRecommendation": {
      kind: "function",
      "@mcp.name": "book-recommendation-admin-service",
      "@mcp.description": "Get a random book recommendation",
      "@mcp.tool": true,
      returns: { type: "cds.String" },
    },
    "cds.outbox.Messages": {
      kind: "entity",
      elements: {
        ID: { key: true, type: "cds.UUID" },
        timestamp: { type: "cds.Timestamp" },
        target: { type: "cds.String" },
        msg: { type: "cds.LargeString" },
        attempts: { type: "cds.Integer", default: { val: 0 } },
        partition: { type: "cds.Integer", default: { val: 0 } },
        lastError: { type: "cds.LargeString" },
        lastAttemptTimestamp: {
          "@cds.on.update": { "=": "$now" },
          type: "cds.Timestamp",
          "@Core.Computed": true,
        },
        status: { type: "cds.String", length: 23 },
      },
    },
  },
} as any;

describe("Parser - Hints", () => {
  describe("parseDefinitions", () => {
    const result = parseDefinitions(mockCsn);

    test("Should be able to parse hints on resource elements", () => {
      const entity = result.get("CatalogService.Books");

      expect(entity).toBeDefined();
      expect(entity?.propertyHints).toBeDefined();
      expect(entity?.propertyHints.size).toEqual(2);
      expect(entity?.propertyHints.get("stock")).toEqual(
        "The amount of books currently on store shelves",
      );
      expect(entity?.propertyHints.get("ID")).toEqual(
        "Must be a unique number not already in the system",
      );
    });

    test("Should be able to parse hints on resource array elements", () => {
      const entity = result.get("CatalogService.Authors");

      expect(entity).toBeDefined();
      expect(entity?.propertyHints).toBeDefined();
      expect(entity?.propertyHints.size).toEqual(2);
      expect(entity?.propertyHints.get("name")).toEqual(
        "Full name of the author",
      );
      expect(entity?.propertyHints.get("nominations")).toEqual(
        "Awards that the author has been nominated for",
      );
    });

    test("Should be able to parse hints on tool elements", () => {
      const tool = result.get("CatalogService.getBooksByAuthor");

      expect(tool).toBeDefined();
      expect(tool?.propertyHints).toBeDefined();
      expect(tool?.propertyHints.size).toEqual(1);
      expect(tool?.propertyHints.get("authorName")).toEqual(
        "Full name of the author you want to get the books of",
      );
    });

    test("Should be able to parse hints on tool complex elements", () => {
      const tool = result.get("CatalogService.getNotReal");

      expect(tool).toBeDefined();
      expect(tool?.propertyHints).toBeDefined();
      expect(tool?.propertyHints.size).toEqual(1);
      expect(tool?.propertyHints.get("value")).toEqual(
        "Only takes in positive numbers, i.e. no negative values such as -1",
      );
    });
  });
});
