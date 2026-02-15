// Set up global.cds BEFORE importing the module with a mutable model
const mockModel: any = {
  definitions: {},
};

(global as any).cds = {
  get model() {
    return mockModel;
  },
  set model(value) {
    Object.assign(mockModel, value);
  },
  test: jest.fn().mockResolvedValue(undefined),
  services: {},
  connect: {
    to: jest.fn(),
  },
  User: {
    privileged: { id: "privileged", name: "Privileged User" },
    anonymous: { id: "anonymous", _is_anonymous: true },
  },
  context: {
    user: null,
  },
};

import {
  determineMcpParameterType,
  handleMcpSessionRequest,
  writeODataDescriptionForResource,
  applyOmissionFilter,
} from "../../../src/mcp/utils";
import { McpResourceAnnotation } from "../../../src/annotations/structures";
import { McpSession } from "../../../src/mcp/types";
import { Request, Response } from "express";
import { z } from "zod";

// Mock the CDS require since it's used as fallback
jest.mock(
  "@sap/cds",
  () => ({
    model: {
      definitions: {},
    },
    test: jest.fn().mockResolvedValue(undefined),
    services: {},
    connect: {
      to: jest.fn(),
    },
    User: {
      privileged: { id: "privileged", name: "Privileged User" },
      anonymous: { id: "anonymous", _is_anonymous: true },
    },
    context: {
      user: null,
    },
  }),
  { virtual: true },
);

// Mock zod
const mockOptional = jest.fn(() => "optional-type");
const mockZodType = {
  optional: mockOptional,
};

const mockNumberIntType = {
  ...mockZodType,
  _type: "number-int-type",
  min: jest.fn(() => ({ ...mockZodType, _type: "number-int-min-type" })),
};
const mockNumberType = {
  ...mockZodType,
  _type: "number-type",
  int: jest.fn(() => mockNumberIntType),
};
const mockUnionTransformType = {
  ...mockZodType,
  _type: "union-transform-type",
};
const mockUnionType = {
  transform: jest.fn(() => mockUnionTransformType),
};

jest.mock("zod", () => ({
  z: {
    string: jest.fn(() => ({ ...mockZodType, _type: "string-type" })),
    number: jest.fn(() => mockNumberType),
    boolean: jest.fn(() => ({ ...mockZodType, _type: "boolean-type" })),
    date: jest.fn(() => ({ ...mockZodType, _type: "date-type" })),
    array: jest.fn(
      (itemType: any) => `array-of-${itemType?._type || itemType}`,
    ),
    any: jest.fn(() => "any-type"),
    object: jest.fn(() => "object-type"),
    union: jest.fn(() => mockUnionType),
    coerce: {
      date: jest.fn(() => ({ ...mockZodType, _type: "coerce-date-type" })),
    },
  },
}));

describe("Server Utils", () => {
  describe("determineMcpParameterType", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test("should return string type for String CDS type", () => {
      const result = determineMcpParameterType("String");
      expect(z.string).toHaveBeenCalled();
      expect(result).toMatchObject({ _type: "string-type" });
    });

    test("should return string type for UUID CDS type", () => {
      const result = determineMcpParameterType("UUID");
      expect(z.string).toHaveBeenCalled();
      expect(result).toMatchObject({ _type: "string-type" });
    });

    test("should return coerced date type for Date CDS types", () => {
      const dateTypes = ["Date", "Time", "DateTime"];

      dateTypes.forEach((type) => {
        const result = determineMcpParameterType(type);
        expect(result).toMatchObject({ _type: "coerce-date-type" });
      });

      expect(z.coerce.date).toHaveBeenCalledTimes(dateTypes.length);
    });

    test("should return coerced date type for Timestamp CDS type", () => {
      const result = determineMcpParameterType("Timestamp");
      expect(z.coerce.date).toHaveBeenCalled();
      expect(result).toMatchObject({ _type: "coerce-date-type" });
    });

    test("should return integer type for safe integer CDS types", () => {
      const intTypes = ["Integer", "Int16", "Int32"];

      intTypes.forEach((type) => {
        const result = determineMcpParameterType(type);
        expect(result).toMatchObject({ _type: "number-int-type" });
      });
    });

    test("should return integer type with min(0) for UInt8", () => {
      const result = determineMcpParameterType("UInt8");
      expect(result).toMatchObject({ _type: "number-int-min-type" });
    });

    test("should return union+transform type for Int64 and Decimal", () => {
      ["Int64", "Decimal"].forEach((type) => {
        const result = determineMcpParameterType(type);
        expect(result).toMatchObject({ _type: "union-transform-type" });
      });
      expect(z.union).toHaveBeenCalled();
    });

    test("should return number type for Double", () => {
      const result = determineMcpParameterType("Double");
      expect(result).toMatchObject({ _type: "number-type" });
    });

    test("should return boolean type for Boolean CDS type", () => {
      const result = determineMcpParameterType("Boolean");
      expect(z.boolean).toHaveBeenCalled();
      expect(result).toMatchObject({ _type: "boolean-type" });
    });

    test("should return string type for Binary CDS types", () => {
      const binaryTypes = ["Binary", "LargeBinary", "LargeString"];

      binaryTypes.forEach((type) => {
        const result = determineMcpParameterType(type);
        expect(result).toMatchObject({ _type: "string-type" });
      });

      expect(z.string).toHaveBeenCalledTimes(binaryTypes.length);
    });

    test("should return any type for Map CDS type", () => {
      const result = determineMcpParameterType("Map");
      expect(z.object).toHaveBeenCalled();
      expect(result).toBe("object-type");
    });

    test("should return array types for Array CDS types", () => {
      const arrayTypes = [
        "StringArray",
        "DateArray",
        "TimeArray",
        "DateTimeArray",
        "TimestampArray",
        "UUIDArray",
        "IntegerArray",
        "Int16Array",
        "Int32Array",
        "Int64Array",
        "UInt8Array",
        "DecimalArray",
        "BooleanArray",
        "DoubleArray",
        "BinaryArray",
        "LargeBinaryArray",
        "LargeStringArray",
        "MapArray",
      ];

      arrayTypes.forEach((type) => {
        const result = determineMcpParameterType(type);
        expect(typeof result === "string" ? result : "").toMatch(/^array-of-/);
      });
    });

    test("should default to string type for unknown CDS type", () => {
      const result = determineMcpParameterType("UnknownType");
      expect(z.string).toHaveBeenCalled();
      expect(result).toMatchObject({ _type: "string-type" });
    });

    test("should handle empty string", () => {
      const result = determineMcpParameterType("");
      expect(z.string).toHaveBeenCalled();
      expect(result).toMatchObject({ _type: "string-type" });
    });

    test("should handle null input", () => {
      const result = determineMcpParameterType(null as any);
      expect(z.string).toHaveBeenCalled();
      expect(result).toMatchObject({ _type: "string-type" });
    });

    test("should handle undefined input", () => {
      const result = determineMcpParameterType(undefined as any);
      expect(z.string).toHaveBeenCalled();
      expect(result).toMatchObject({ _type: "string-type" });
    });

    test("should handle case sensitivity", () => {
      const resultLower = determineMcpParameterType("string");
      const resultUpper = determineMcpParameterType("STRING");

      expect(z.string).toHaveBeenCalledTimes(2);
      expect(resultLower).toMatchObject({ _type: "string-type" });
      expect(resultUpper).toMatchObject({ _type: "string-type" });
    });

    describe("Composition type handling", () => {
      // Store original cds reference
      const originalCds = (global as any).cds;

      beforeEach(() => {
        jest.clearAllMocks();
        // Reset the mockModel to default state
        mockModel.definitions = {};
      });

      afterEach(() => {
        // Restore original cds after each test
        (global as any).cds = originalCds;
      });

      test("should return object type for Composition when model definitions are missing", () => {
        // Mock cds.model without definitions by updating the mockModel
        mockModel.definitions = null;

        const result = determineMcpParameterType(
          "Composition",
          "address",
          "Customer",
        );
        expect(z.object).toHaveBeenCalledWith({});
        expect(result).toBe("object-type");
      });

      test("should return object type for Composition when target is missing", () => {
        // Default mockModel has empty definitions, no target parameter
        const result = determineMcpParameterType("Composition");
        expect(z.object).toHaveBeenCalledWith({});
        expect(result).toBe("object-type");
      });

      test("should return object type for Composition when key is missing", () => {
        // Default mockModel has empty definitions, no key parameter
        const result = determineMcpParameterType(
          "Composition",
          undefined,
          "Customer",
        );
        expect(z.object).toHaveBeenCalledWith({});
        expect(result).toBe("object-type");
      });

      test("should handle Composition with simple entity structure", () => {
        // Mock a complete CDS model with composition
        mockModel.definitions = {
          Customer: {
            elements: {
              address: {
                target: "Address",
                cardinality: undefined, // Single composition
              },
            },
          },
          Address: {
            elements: {
              street: {
                type: "String",
                key: false,
                notNull: false,
              },
              city: {
                type: "String",
                key: false,
                notNull: true,
              },
              zipCode: {
                type: "String",
                key: true,
                notNull: true,
              },
            },
          },
        };

        const result = determineMcpParameterType(
          "Composition",
          "address",
          "Customer",
        );

        // Verify that z.object was called to build the composition schema
        expect(z.object).toHaveBeenCalled();
        expect(result).toBe("object-type");
      });

      test("should handle Composition with array cardinality", () => {
        // Mock CDS model with array composition
        mockModel.definitions = {
          Order: {
            elements: {
              items: {
                target: "OrderItem",
                cardinality: { max: "*" }, // Array composition
              },
            },
          },
          OrderItem: {
            elements: {
              product: {
                type: "String",
                key: false,
                notNull: true,
              },
              quantity: {
                type: "Integer",
                key: false,
                notNull: false,
              },
            },
          },
        };

        const result = determineMcpParameterType(
          "Composition",
          "items",
          "Order",
        );

        // Should call z.array for array compositions
        expect(z.array).toHaveBeenCalled();
        expect(z.object).toHaveBeenCalled();
        expect(result).toMatch(/^array-of-/);
      });

      test("should handle Composition with various CDS types", () => {
        // Mock CDS model with different field types
        mockModel.definitions = {
          Document: {
            elements: {
              metadata: {
                target: "DocumentMetadata",
                cardinality: undefined,
              },
            },
          },
          DocumentMetadata: {
            elements: {
              id: {
                type: "cds.UUID",
                key: true,
                notNull: true,
              },
              title: {
                type: "cds.String",
                key: false,
                notNull: true,
              },
              createdAt: {
                type: "cds.DateTime",
                key: false,
                notNull: false,
              },
              isPublic: {
                type: "cds.Boolean",
                key: false,
                notNull: false,
              },
              size: {
                type: "cds.Integer",
                key: false,
                notNull: false,
              },
            },
          },
        };

        const result = determineMcpParameterType(
          "Composition",
          "metadata",
          "Document",
        );

        expect(z.object).toHaveBeenCalled();
        expect(result).toBe("object-type");
      });

      test("should skip Association and nested Composition fields", () => {
        // Mock CDS model with nested associations/compositions
        mockModel.definitions = {
          Complex: {
            elements: {
              nested: {
                target: "NestedEntity",
                cardinality: undefined,
              },
            },
          },
          NestedEntity: {
            elements: {
              simpleField: {
                type: "String",
                key: false,
                notNull: false,
              },
              associationField: {
                type: "Association",
                target: "SomeOtherEntity",
                key: false,
                notNull: false,
              },
              compositionField: {
                type: "Composition",
                target: "AnotherEntity",
                key: false,
                notNull: false,
              },
            },
          },
        };

        const result = determineMcpParameterType(
          "Composition",
          "nested",
          "Complex",
        );

        // Should only process the simpleField, skip association and composition
        expect(z.object).toHaveBeenCalled();
        expect(result).toBe("object-type");
      });

      test("should handle missing target definition gracefully", () => {
        // Mock CDS model with missing target entity
        mockModel.definitions = {
          Customer: {
            elements: {
              address: {
                target: "NonExistentAddress",
                cardinality: undefined,
              },
            },
          },
          // Note: NonExistentAddress is not defined
        };

        const result = determineMcpParameterType(
          "Composition",
          "address",
          "Customer",
        );

        expect(z.object).toHaveBeenCalledWith({});
        expect(result).toBe("object-type");
      });

      test("should handle fields without type property", () => {
        // Mock CDS model with fields missing type
        mockModel.definitions = {
          Entity: {
            elements: {
              comp: {
                target: "TargetEntity",
                cardinality: undefined,
              },
            },
          },
          TargetEntity: {
            elements: {
              validField: {
                type: "String",
                key: false,
                notNull: false,
              },
              fieldWithoutType: {
                // Missing type property
                key: false,
                notNull: false,
              },
            },
          },
        };

        const result = determineMcpParameterType(
          "Composition",
          "comp",
          "Entity",
        );

        // Should process only the field with type
        expect(z.object).toHaveBeenCalled();
        expect(result).toBe("object-type");
      });

      test("should handle optional vs required fields correctly", () => {
        // Mock CDS model with mix of optional/required fields
        mockModel.definitions = {
          Parent: {
            elements: {
              child: {
                target: "Child",
                cardinality: undefined,
              },
            },
          },
          Child: {
            elements: {
              keyField: {
                type: "String",
                key: true,
                notNull: true,
              },
              requiredField: {
                type: "String",
                key: false,
                notNull: true,
              },
              optionalField: {
                type: "String",
                key: false,
                notNull: false,
              },
              defaultOptional: {
                type: "String",
                // key and notNull undefined - should be optional
              },
            },
          },
        };

        const result = determineMcpParameterType(
          "Composition",
          "child",
          "Parent",
        );

        expect(z.object).toHaveBeenCalled();
        expect(result).toBe("object-type");
      });

      test("should handle composition with empty target entity", () => {
        // Mock CDS model with empty target entity
        mockModel.definitions = {
          Parent: {
            elements: {
              empty: {
                target: "EmptyEntity",
                cardinality: undefined,
              },
            },
          },
          EmptyEntity: {
            elements: {},
          },
        };

        const result = determineMcpParameterType(
          "Composition",
          "empty",
          "Parent",
        );

        expect(z.object).toHaveBeenCalledWith({});
        expect(result).toBe("object-type");
      });
    });
  });

  describe("handleMcpSessionRequest", () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockSessions: Map<string, McpSession>;
    let mockSession: McpSession;

    beforeEach(() => {
      mockReq = {
        headers: {},
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };
      mockSession = {
        transport: {
          handleRequest: jest.fn(),
        } as any,
        server: {} as any,
      };
      mockSessions = new Map();
    });

    test("should handle valid session request", async () => {
      mockReq.headers = { "mcp-session-id": "valid-session-id" };
      mockSessions.set("valid-session-id", mockSession);

      await handleMcpSessionRequest(
        mockReq as Request,
        mockRes as Response,
        mockSessions,
      );

      expect(mockSession.transport.handleRequest).toHaveBeenCalledWith(
        mockReq,
        mockRes,
      );
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test("should reject request with missing session header", async () => {
      await handleMcpSessionRequest(
        mockReq as Request,
        mockRes as Response,
        mockSessions,
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith(
        "Invalid or missing session ID",
      );
    });

    test("should reject request with invalid session ID", async () => {
      mockReq.headers = { "mcp-session-id": "invalid-session-id" };

      await handleMcpSessionRequest(
        mockReq as Request,
        mockRes as Response,
        mockSessions,
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith(
        "Invalid or missing session ID",
      );
    });

    test("should handle session that exists in map but is undefined", async () => {
      mockReq.headers = { "mcp-session-id": "session-id" };
      mockSessions.set("session-id", undefined as any);

      await handleMcpSessionRequest(
        mockReq as Request,
        mockRes as Response,
        mockSessions,
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith("Invalid session");
    });

    test("should handle empty session ID", async () => {
      mockReq.headers = { "mcp-session-id": "" };

      await handleMcpSessionRequest(
        mockReq as Request,
        mockRes as Response,
        mockSessions,
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith(
        "Invalid or missing session ID",
      );
    });

    test("should handle null session ID", async () => {
      mockReq.headers = { "mcp-session-id": null as any };

      await handleMcpSessionRequest(
        mockReq as Request,
        mockRes as Response,
        mockSessions,
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith(
        "Invalid or missing session ID",
      );
    });

    test("should handle case with multiple sessions", async () => {
      const session1 = { ...mockSession };
      const session2 = {
        transport: { handleRequest: jest.fn() },
        server: {} as any,
      };

      mockSessions.set("session-1", session1);
      mockSessions.set("session-2", session2 as any);

      mockReq.headers = { "mcp-session-id": "session-2" };

      await handleMcpSessionRequest(
        mockReq as Request,
        mockRes as Response,
        mockSessions,
      );

      expect(session2.transport.handleRequest).toHaveBeenCalledWith(
        mockReq,
        mockRes,
      );
      expect(session1.transport.handleRequest).not.toHaveBeenCalled();
    });
  });

  describe("writeODataDescriptionForResource", () => {
    test("should write complete description for resource with all functionalities", () => {
      const resourceAnnotation = new McpResourceAnnotation(
        "Test Resource",
        "Test description",
        "TestEntity",
        "TestService",
        new Set(["filter", "top", "skip", "select", "orderby"]),
        new Map([
          ["id", "UUID"],
          ["name", "String"],
          ["count", "Integer"],
        ]),
        new Map([["id", "UUID"]]),
        new Map(),
      );

      const result = writeODataDescriptionForResource(resourceAnnotation);

      expect(result).toContain("Test description.");
      expect(result).toContain("Should be queried using OData v4 query style");
      expect(result).toContain("- filter: OData $filter syntax");
      expect(result).toContain("- top: OData $top syntax");
      expect(result).toContain("- skip: OData $skip syntax");
      expect(result).toContain("- select: OData $select syntax");
      expect(result).toContain("- orderby: OData $orderby syntax");
      expect(result).toContain("Available properties on TestEntity:");
      expect(result).toContain("- id -> value type = UUID");
      expect(result).toContain("- name -> value type = String");
      expect(result).toContain("- count -> value type = Integer");
    });

    test("should write description for resource with limited functionalities", () => {
      const resourceAnnotation = new McpResourceAnnotation(
        "Limited Resource",
        "Limited description",
        "LimitedEntity",
        "TestService",
        new Set(["filter", "top"]),
        new Map([["id", "UUID"]]),
        new Map(),
        new Map(),
      );

      const result = writeODataDescriptionForResource(resourceAnnotation);

      expect(result).toContain("Limited description.");
      expect(result).toContain("- filter: OData $filter syntax");
      expect(result).toContain("- top: OData $top syntax");
      expect(result).not.toContain("- skip: OData $skip syntax");
      expect(result).not.toContain("- select: OData $select syntax");
      expect(result).not.toContain("- orderby: OData $orderby syntax");
      expect(result).toContain("- id -> value type = UUID");
    });

    test("should handle resource with no functionalities", () => {
      const resourceAnnotation = new McpResourceAnnotation(
        "No Features",
        "No features description",
        "NoFeaturesEntity",
        "TestService",
        new Set(),
        new Map([["id", "UUID"]]),
        new Map(),
        new Map(),
      );

      const result = writeODataDescriptionForResource(resourceAnnotation);

      expect(result).toContain("No features description.");
      expect(result).toContain("Should be queried using OData v4 query style");
      expect(result).not.toContain("- filter:");
      expect(result).not.toContain("- top:");
      expect(result).toContain("Available properties on NoFeaturesEntity:");
      expect(result).toContain("- id -> value type = UUID");
    });

    test("should handle resource with no properties", () => {
      const resourceAnnotation = new McpResourceAnnotation(
        "No Props",
        "No properties description",
        "NoPropsEntity",
        "TestService",
        new Set(["filter"]),
        new Map(),
        new Map(),
        new Map(),
      );

      const result = writeODataDescriptionForResource(resourceAnnotation);

      expect(result).toContain("No properties description.");
      expect(result).toContain("- filter: OData $filter syntax");
      expect(result).toContain("Available properties on NoPropsEntity:");
      // Should still have the section header even with no properties
    });

    test("should handle resource with single functionality", () => {
      const resourceAnnotation = new McpResourceAnnotation(
        "Single Function",
        "Single functionality description",
        "SingleEntity",
        "TestService",
        new Set(["select"]),
        new Map([
          ["field1", "String"],
          ["field2", "Integer"],
        ]),
        new Map(),
        new Map(),
      );

      const result = writeODataDescriptionForResource(resourceAnnotation);

      expect(result).toContain("Single functionality description.");
      expect(result).toContain("- select: OData $select syntax");
      expect(result).not.toContain("- filter:");
      expect(result).not.toContain("- top:");
      expect(result).not.toContain("- skip:");
      expect(result).not.toContain("- orderby:");
      expect(result).toContain("- field1 -> value type = String");
      expect(result).toContain("- field2 -> value type = Integer");
    });

    test("should handle resource with complex property types", () => {
      const resourceAnnotation = new McpResourceAnnotation(
        "Complex Types",
        "Complex types description",
        "ComplexEntity",
        "TestService",
        new Set(["filter"]),
        new Map([
          ["uuid_field", "UUID"],
          ["datetime_field", "DateTime"],
          ["decimal_field", "Decimal"],
          ["boolean_field", "Boolean"],
        ]),
        new Map(),
        new Map(),
      );

      const result = writeODataDescriptionForResource(resourceAnnotation);

      expect(result).toContain("- uuid_field -> value type = UUID");
      expect(result).toContain("- datetime_field -> value type = DateTime");
      expect(result).toContain("- decimal_field -> value type = Decimal");
      expect(result).toContain("- boolean_field -> value type = Boolean");
    });

    test("should include newlines correctly", () => {
      const resourceAnnotation = new McpResourceAnnotation(
        "Newline Test",
        "Newline test description",
        "NewlineEntity",
        "TestService",
        new Set(["filter"]),
        new Map([["id", "UUID"]]),
        new Map(),
        new Map(),
      );

      const result = writeODataDescriptionForResource(resourceAnnotation);

      // Should contain multiple newlines for proper formatting
      const newlineCount = (result.match(/\n/g) || []).length;
      expect(newlineCount).toBeGreaterThan(3);
    });

    test("should handle empty description", () => {
      const resourceAnnotation = new McpResourceAnnotation(
        "Empty Desc",
        "",
        "EmptyDescEntity",
        "TestService",
        new Set(["top"]),
        new Map([["id", "String"]]),
        new Map(),
        new Map(),
      );

      const result = writeODataDescriptionForResource(resourceAnnotation);

      expect(result).toContain("."); // Should still have the period
      expect(result).toContain("Should be queried using OData v4 query style");
      expect(result).toContain("- top: OData $top syntax");
    });

    test("should maintain consistent formatting across all functionalities", () => {
      const resourceAnnotation = new McpResourceAnnotation(
        "All Functions",
        "All functionalities test",
        "AllFunctionsEntity",
        "TestService",
        new Set(["filter", "top", "skip", "select", "orderby"]),
        new Map([["test_field", "String"]]),
        new Map(),
        new Map(),
      );

      const result = writeODataDescriptionForResource(resourceAnnotation);

      // Check that each functionality follows the same pattern
      expect(result).toMatch(/- filter: OData \$filter syntax.*\n/);
      expect(result).toMatch(/- top: OData \$top syntax.*\n/);
      expect(result).toMatch(/- skip: OData \$skip syntax.*\n/);
      expect(result).toMatch(/- select: OData \$select syntax.*\n/);
      expect(result).toMatch(/- orderby: OData \$orderby syntax.*\n/);
    });

    test("should handle very long property names and types", () => {
      const resourceAnnotation = new McpResourceAnnotation(
        "Long Names",
        "Long names test",
        "LongNamesEntity",
        "TestService",
        new Set(["select"]),
        new Map([
          [
            "very_long_property_name_that_exceeds_normal_length",
            "VeryLongCustomTypeName",
          ],
          ["another_extremely_long_field_name", "AnotherCustomType"],
        ]),
        new Map(),
        new Map(),
      );

      const result = writeODataDescriptionForResource(resourceAnnotation);

      expect(result).toContain(
        "- very_long_property_name_that_exceeds_normal_length -> value type = VeryLongCustomTypeName",
      );
      expect(result).toContain(
        "- another_extremely_long_field_name -> value type = AnotherCustomType",
      );
    });
  });

  describe("applyOmissionFilter", () => {
    test("should return undefined for undefined input", () => {
      const mockAnnotation = new McpResourceAnnotation(
        "Test",
        "Test description",
        "TestEntity",
        "TestService",
        new Set(),
        new Map(),
        new Map(),
        new Map(),
      );

      const result = applyOmissionFilter(undefined, mockAnnotation);
      expect(result).toBeUndefined();
    });

    test("should return a copy of object when no fields are omitted", () => {
      const input = {
        ID: 1,
        title: "Test Book",
        author: "Test Author",
      };

      const mockAnnotation = new McpResourceAnnotation(
        "Books",
        "Book catalog",
        "Books",
        "TestService",
        new Set(),
        new Map(),
        new Map(),
        new Map(),
      );

      const result = applyOmissionFilter(input, mockAnnotation);

      // Should return a copy with all fields
      expect(result).toEqual(input);
      // Should be a new object (not the same reference)
      expect(result).not.toBe(input);
    });

    test("should omit single specified field", () => {
      const input = {
        ID: 1,
        title: "Harry Potter",
        author: "J.K. Rowling",
        secretMessage: "This should be hidden",
      };

      const omittedFields = new Set(["secretMessage"]);
      const mockAnnotation = new McpResourceAnnotation(
        "Books",
        "Book catalog",
        "Books",
        "TestService",
        new Set(),
        new Map(),
        new Map(),
        new Map(),
        undefined,
        undefined,
        undefined,
        undefined,
        omittedFields,
      );

      const result = applyOmissionFilter(input, mockAnnotation) as any;

      expect(result).toHaveProperty("ID", 1);
      expect(result).toHaveProperty("title", "Harry Potter");
      expect(result).toHaveProperty("author", "J.K. Rowling");
      expect(result).not.toHaveProperty("secretMessage");
    });

    test("should omit multiple specified fields", () => {
      const input = {
        ID: 1,
        name: "John Doe",
        email: "john@example.com",
        password: "secret123",
        ssn: "123-45-6789",
        creditCard: "1234-5678-9012-3456",
      };

      const omittedFields = new Set(["password", "ssn", "creditCard"]);
      const mockAnnotation = new McpResourceAnnotation(
        "Users",
        "User data",
        "Users",
        "TestService",
        new Set(),
        new Map(),
        new Map(),
        new Map(),
        undefined,
        undefined,
        undefined,
        undefined,
        omittedFields,
      );

      const result = applyOmissionFilter(input, mockAnnotation) as any;

      expect(result).toHaveProperty("ID", 1);
      expect(result).toHaveProperty("name", "John Doe");
      expect(result).toHaveProperty("email", "john@example.com");
      expect(result).not.toHaveProperty("password");
      expect(result).not.toHaveProperty("ssn");
      expect(result).not.toHaveProperty("creditCard");
    });

    test("should handle objects with nested properties", () => {
      const input = {
        ID: 1,
        title: "Test",
        metadata: {
          created: "2024-01-01",
          updated: "2024-01-02",
        },
        secretData: "hidden",
      };

      const omittedFields = new Set(["secretData"]);
      const mockAnnotation = new McpResourceAnnotation(
        "Items",
        "Item data",
        "Items",
        "TestService",
        new Set(),
        new Map(),
        new Map(),
        new Map(),
        undefined,
        undefined,
        undefined,
        undefined,
        omittedFields,
      );

      const result = applyOmissionFilter(input, mockAnnotation) as any;

      expect(result).toHaveProperty("ID", 1);
      expect(result).toHaveProperty("title", "Test");
      expect(result).toHaveProperty("metadata");
      expect(result.metadata).toEqual({
        created: "2024-01-01",
        updated: "2024-01-02",
      });
      expect(result).not.toHaveProperty("secretData");
    });

    test("should handle objects with null values", () => {
      const input = {
        ID: 1,
        title: "Test",
        description: null,
        secretField: null,
      };

      const omittedFields = new Set(["secretField"]);
      const mockAnnotation = new McpResourceAnnotation(
        "Items",
        "Item data",
        "Items",
        "TestService",
        new Set(),
        new Map(),
        new Map(),
        new Map(),
        undefined,
        undefined,
        undefined,
        undefined,
        omittedFields,
      );

      const result = applyOmissionFilter(input, mockAnnotation) as any;

      expect(result).toHaveProperty("ID", 1);
      expect(result).toHaveProperty("title", "Test");
      expect(result).toHaveProperty("description", null);
      expect(result).not.toHaveProperty("secretField");
    });

    test("should handle empty objects", () => {
      const input = {};

      const omittedFields = new Set(["secretField"]);
      const mockAnnotation = new McpResourceAnnotation(
        "Items",
        "Item data",
        "Items",
        "TestService",
        new Set(),
        new Map(),
        new Map(),
        new Map(),
        undefined,
        undefined,
        undefined,
        undefined,
        omittedFields,
      );

      const result = applyOmissionFilter(input, mockAnnotation);

      expect(result).toEqual({});
      expect(result).not.toBe(input); // Should be a copy
    });

    test("should handle omitting all fields", () => {
      const input = {
        secret1: "value1",
        secret2: "value2",
        secret3: "value3",
      };

      const omittedFields = new Set(["secret1", "secret2", "secret3"]);
      const mockAnnotation = new McpResourceAnnotation(
        "Secrets",
        "Secret data",
        "Secrets",
        "TestService",
        new Set(),
        new Map(),
        new Map(),
        new Map(),
        undefined,
        undefined,
        undefined,
        undefined,
        omittedFields,
      );

      const result = applyOmissionFilter(input, mockAnnotation);

      expect(result).toEqual({});
    });

    test("should handle undefined omittedFields set", () => {
      const input = {
        ID: 1,
        title: "Test",
        data: "some data",
      };

      const mockAnnotation = new McpResourceAnnotation(
        "Items",
        "Item data",
        "Items",
        "TestService",
        new Set(),
        new Map(),
        new Map(),
        new Map(),
        undefined,
        undefined,
        undefined,
        undefined, // No omitted fields
      );

      const result = applyOmissionFilter(input, mockAnnotation);

      // Should return a copy with all fields
      expect(result).toEqual(input);
      expect(result).not.toBe(input);
    });

    test("should handle empty omittedFields set", () => {
      const input = {
        ID: 1,
        title: "Test",
        data: "some data",
      };

      const omittedFields = new Set<string>();
      const mockAnnotation = new McpResourceAnnotation(
        "Items",
        "Item data",
        "Items",
        "TestService",
        new Set(),
        new Map(),
        new Map(),
        new Map(),
        undefined,
        undefined,
        undefined,
        undefined,
        omittedFields,
      );

      const result = applyOmissionFilter(input, mockAnnotation);

      expect(result).toEqual(input);
      expect(result).not.toBe(input);
    });

    test("should not mutate original object", () => {
      const input = {
        ID: 1,
        title: "Test",
        secretField: "secret",
      };

      const originalInput = { ...input };
      const omittedFields = new Set(["secretField"]);
      const mockAnnotation = new McpResourceAnnotation(
        "Items",
        "Item data",
        "Items",
        "TestService",
        new Set(),
        new Map(),
        new Map(),
        new Map(),
        undefined,
        undefined,
        undefined,
        undefined,
        omittedFields,
      );

      applyOmissionFilter(input, mockAnnotation);

      // Original input should not be modified
      expect(input).toEqual(originalInput);
      expect(input).toHaveProperty("secretField", "secret");
    });

    test("should handle objects with various data types", () => {
      const input = {
        ID: 1,
        title: "Test",
        count: 42,
        isActive: true,
        price: 99.99,
        tags: ["tag1", "tag2"],
        secretNumber: 12345,
      };

      const omittedFields = new Set(["secretNumber"]);
      const mockAnnotation = new McpResourceAnnotation(
        "Products",
        "Product data",
        "Products",
        "TestService",
        new Set(),
        new Map(),
        new Map(),
        new Map(),
        undefined,
        undefined,
        undefined,
        undefined,
        omittedFields,
      );

      const result = applyOmissionFilter(input, mockAnnotation) as any;

      expect(result.ID).toBe(1);
      expect(result.title).toBe("Test");
      expect(result.count).toBe(42);
      expect(result.isActive).toBe(true);
      expect(result.price).toBe(99.99);
      expect(result.tags).toEqual(["tag1", "tag2"]);
      expect(result).not.toHaveProperty("secretNumber");
    });
  });
});
