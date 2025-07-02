import {
  determineMcpParameterType,
  handleMcpSessionRequest,
  writeODataDescriptionForResource,
  parseODataFilterString,
} from "../../../src/mcp/utils";
import { McpResourceAnnotation } from "../../../src/annotations/structures";
import { McpSession } from "../../../src/mcp/types";
import { Request, Response } from "express";
import { z } from "zod";

// Mock zod
jest.mock("zod", () => ({
  z: {
    string: jest.fn(() => "string-type"),
    number: jest.fn(() => "number-type"),
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
      expect(result).toBe("string-type");
    });

    test("should return number type for Integer CDS type", () => {
      const result = determineMcpParameterType("Integer");
      expect(z.number).toHaveBeenCalled();
      expect(result).toBe("number-type");
    });

    test("should default to string type for unknown CDS type", () => {
      const result = determineMcpParameterType("UnknownType");
      expect(z.string).toHaveBeenCalled();
      expect(result).toBe("string-type");
    });

    test("should handle empty string", () => {
      const result = determineMcpParameterType("");
      expect(z.string).toHaveBeenCalled();
      expect(result).toBe("string-type");
    });

    test("should handle null input", () => {
      const result = determineMcpParameterType(null as any);
      expect(z.string).toHaveBeenCalled();
      expect(result).toBe("string-type");
    });

    test("should handle undefined input", () => {
      const result = determineMcpParameterType(undefined as any);
      expect(z.string).toHaveBeenCalled();
      expect(result).toBe("string-type");
    });

    test("should handle case sensitivity", () => {
      const resultLower = determineMcpParameterType("string");
      const resultUpper = determineMcpParameterType("STRING");

      expect(z.string).toHaveBeenCalledTimes(2);
      expect(resultLower).toBe("string-type");
      expect(resultUpper).toBe("string-type");
    });

    test("should handle special CDS types", () => {
      const types = ["UUID", "DateTime", "Boolean", "Decimal", "Double"];

      types.forEach((type) => {
        const result = determineMcpParameterType(type);
        expect(result).toBe("string-type");
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

  describe("parseODataFilterString", () => {
    describe("Basic operator mapping", () => {
      test("should convert eq to =", () => {
        const result = parseODataFilterString("name%20eq%20%27John%27");
        expect(result).toBe("name = 'John'");
      });

      test("should convert lt to <", () => {
        const result = parseODataFilterString("age%20lt%2030");
        expect(result).toBe("age < 30");
      });

      test("should convert le to <=", () => {
        const result = parseODataFilterString("age%20le%2030");
        expect(result).toBe("age <= 30");
      });

      test("should convert gt to >", () => {
        const result = parseODataFilterString("age%20gt%2018");
        expect(result).toBe("age > 18");
      });

      test("should convert ge to >=", () => {
        const result = parseODataFilterString("age%20ge%2018");
        expect(result).toBe("age >= 18");
      });

      test("should convert ne to !=", () => {
        const result = parseODataFilterString("status%20ne%20%27inactive%27");
        expect(result).toBe("status != 'inactive'");
      });
    });

    describe("Multiple operators", () => {
      test("should handle multiple different operators", () => {
        const result = parseODataFilterString(
          "age%20gt%2018%20and%20age%20lt%2065",
        );
        expect(result).toBe("age > 18 and age < 65");
      });

      test("should handle same operator multiple times", () => {
        const result = parseODataFilterString(
          "name%20eq%20%27John%27%20or%20name%20eq%20%27Jane%27",
        );
        expect(result).toBe("name = 'John' or name = 'Jane'");
      });

      test("should handle complex filter with all operators", () => {
        const result = parseODataFilterString(
          "age%20ge%2018%20and%20age%20le%2065%20and%20status%20ne%20%27inactive%27%20and%20score%20gt%2050",
        );
        expect(result).toBe(
          "age >= 18 and age <= 65 and status != 'inactive' and score > 50",
        );
      });
    });

    describe("URL encoding handling", () => {
      test("should decode URL encoded characters", () => {
        const result = parseODataFilterString("name%20eq%20%27John%20Doe%27");
        expect(result).toBe("name = 'John Doe'");
      });

      test("should handle special characters in values", () => {
        const result = parseODataFilterString(
          "email%20eq%20%27john%40example.com%27",
        );
        expect(result).toBe("email = 'john@example.com'");
      });

      test("should handle encoded parentheses", () => {
        const result = parseODataFilterString(
          "name%20eq%20%27John%20%28Jr%29%27",
        );
        expect(result).toBe("name = 'John (Jr)'");
      });

      test("should handle percent signs in values", () => {
        const result = parseODataFilterString("discount%20eq%20%2710%25%27");
        expect(result).toBe("discount = '10%'");
      });
    });

    describe("Edge cases", () => {
      test("should handle empty string", () => {
        const result = parseODataFilterString("");
        expect(result).toBe("");
      });

      test("should handle string without operators", () => {
        const result = parseODataFilterString("just%20some%20text");
        expect(result).toBe("just some text");
      });

      test("should handle operators without proper spacing", () => {
        const result = parseODataFilterString("nameeq%27John%27");
        expect(result).toBe("nameeq'John'");
      });

      test("should not modify operators that are part of words", () => {
        const result = parseODataFilterString(
          "description%20eq%20%27equipment%20specs%27",
        );
        expect(result).toBe("description = 'equipment specs'");
      });

      test("should handle case sensitivity correctly", () => {
        const result = parseODataFilterString("name%20EQ%20%27John%27");
        expect(result).toBe("name EQ 'John'"); // Should not convert uppercase
      });
    });

    describe("Complex expressions", () => {
      test("should handle nested expressions with parentheses", () => {
        const result = parseODataFilterString(
          "%28age%20gt%2018%20and%20age%20lt%2065%29%20or%20status%20eq%20%27VIP%27",
        );
        expect(result).toBe("(age > 18 and age < 65) or status = 'VIP'");
      });

      test("should handle function calls in filters", () => {
        const result = parseODataFilterString(
          "startswith%28name%2C%20%27John%27%29%20eq%20true",
        );
        expect(result).toBe("startswith(name, 'John') = true");
      });

      test("should handle numeric comparisons", () => {
        const result = parseODataFilterString(
          "price%20ge%2019.99%20and%20price%20le%20100.00",
        );
        expect(result).toBe("price >= 19.99 and price <= 100.00");
      });

      test("should handle date comparisons", () => {
        const result = parseODataFilterString(
          "created%20gt%202023-01-01T00%3A00%3A00Z",
        );
        expect(result).toBe("created > 2023-01-01T00:00:00Z");
      });
    });

    describe("Real-world examples", () => {
      test("should handle typical user search filter", () => {
        const result = parseODataFilterString(
          "firstName%20eq%20%27John%27%20and%20lastName%20eq%20%27Doe%27%20and%20isActive%20eq%20true",
        );
        expect(result).toBe(
          "firstName = 'John' and lastName = 'Doe' and isActive = true",
        );
      });

      test("should handle product filter with price range", () => {
        const result = parseODataFilterString(
          "category%20eq%20%27Electronics%27%20and%20price%20ge%20100%20and%20price%20le%20500",
        );
        expect(result).toBe(
          "category = 'Electronics' and price >= 100 and price <= 500",
        );
      });

      test("should handle order status filter", () => {
        const result = parseODataFilterString(
          "status%20ne%20%27cancelled%27%20and%20%28priority%20eq%20%27high%27%20or%20priority%20eq%20%27urgent%27%29",
        );
        expect(result).toBe(
          "status != 'cancelled' and (priority = 'high' or priority = 'urgent')",
        );
      });

      test("should handle null comparisons", () => {
        const result = parseODataFilterString(
          "middleName%20ne%20null%20and%20email%20ne%20null",
        );
        expect(result).toBe("middleName != null and email != null");
      });
    });

    describe("Input immutability", () => {
      test("should not modify the original input string", () => {
        const original = "name%20eq%20%27John%27";
        const originalCopy = original;
        parseODataFilterString(original);
        expect(original).toBe(originalCopy);
      });
    });

    describe("Performance and stress tests", () => {
      test("should handle very long filter strings", () => {
        const longFilter = Array(100)
          .fill("field%20eq%20%27value%27")
          .join("%20and%20");
        const result = parseODataFilterString(longFilter);
        expect(result).toContain("field = 'value'");
        expect(result.split("and").length).toBe(100);
      });

      test("should handle filters with many repeated operators", () => {
        const manyEq =
          "a%20eq%201%20and%20b%20eq%202%20and%20c%20eq%203%20and%20d%20eq%204%20and%20e%20eq%205";
        const result = parseODataFilterString(manyEq);
        expect(result).toBe("a = 1 and b = 2 and c = 3 and d = 4 and e = 5");
      });
    });

    describe("Boundary conditions", () => {
      test("should handle single character values", () => {
        const result = parseODataFilterString("code%20eq%20%27A%27");
        expect(result).toBe("code = 'A'");
      });

      test("should handle empty quoted strings", () => {
        const result = parseODataFilterString("name%20ne%20%27%27");
        expect(result).toBe("name != ''");
      });

      test("should handle filters with only spaces", () => {
        const result = parseODataFilterString("%20%20%20");
        expect(result).toBe("   ");
      });

      test("should handle mixed case in field names", () => {
        const result = parseODataFilterString(
          "FirstName%20eq%20%27John%27%20and%20lastName%20ne%20%27Doe%27",
        );
        expect(result).toBe("FirstName = 'John' and lastName != 'Doe'");
      });
    });

    describe("Error resistance", () => {
      test("should handle malformed URLs gracefully", () => {
        const result = parseODataFilterString("name%20eq%20John"); // Missing quotes
        expect(result).toBe("name = John");
      });

      test("should handle incomplete encoding", () => {
        const result = parseODataFilterString(
          "name%20eq%20%27John%20and%20age%20gt%2025",
        );
        expect(result).toBe("name = 'John and age > 25");
      });

      test("should handle operators at string boundaries", () => {
        const result = parseODataFilterString("%20eq%20");
        expect(result).toBe(" = ");
      });
    });
  });
});
