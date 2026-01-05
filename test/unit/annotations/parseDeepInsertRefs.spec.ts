import { csn } from "@sap/cds";
import { parseDeepInsertRefs } from "../../../src/annotations/utils";

// Mock logger
jest.mock("../../../src/logger", () => ({
  LOGGER: {
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("parseDeepInsertRefs", () => {
  test("should return empty map when definition has no elements", () => {
    const definition = {} as csn.Definition;

    const result = parseDeepInsertRefs(definition);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  test("should return empty map when elements is undefined", () => {
    const definition = {
      elements: undefined,
    } as any as csn.Definition;

    const result = parseDeepInsertRefs(definition);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  test("should return empty map when elements is empty object", () => {
    const definition = {
      elements: {},
    } as csn.Definition;

    const result = parseDeepInsertRefs(definition);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  test("should parse single deep insert annotation", () => {
    const definition = {
      elements: {
        items: {
          type: "Association",
          target: "OrderItem",
          "@mcp.deepInsert": "OrderService.OrderItem",
        },
      },
    } as any as csn.Definition;

    const result = parseDeepInsertRefs(definition);

    expect(result.size).toBe(1);
    expect(result.get("items")).toBe("OrderService.OrderItem");
  });

  test("should parse multiple deep insert annotations", () => {
    const definition = {
      elements: {
        items: {
          type: "Association",
          target: "BookingItem",
          "@mcp.deepInsert": "BookingService.BookingItem",
        },
        addresses: {
          type: "Association",
          target: "Address",
          "@mcp.deepInsert": "CustomerService.Address",
        },
        contacts: {
          type: "Association",
          target: "Contact",
          "@mcp.deepInsert": "CustomerService.Contact",
        },
      },
    } as any as csn.Definition;

    const result = parseDeepInsertRefs(definition);

    expect(result.size).toBe(3);
    expect(result.get("items")).toBe("BookingService.BookingItem");
    expect(result.get("addresses")).toBe("CustomerService.Address");
    expect(result.get("contacts")).toBe("CustomerService.Contact");
  });

  test("should ignore elements without deep insert annotation", () => {
    const definition = {
      elements: {
        id: {
          type: "cds.UUID",
          key: true,
        },
        name: {
          type: "cds.String",
        },
        items: {
          type: "Association",
          target: "Item",
          "@mcp.deepInsert": "Service.Item",
        },
        category: {
          type: "Association",
          target: "Category",
          // No @mcp.deepInsert annotation
        },
      },
    } as any as csn.Definition;

    const result = parseDeepInsertRefs(definition);

    expect(result.size).toBe(1);
    expect(result.get("items")).toBe("Service.Item");
    expect(result.has("id")).toBe(false);
    expect(result.has("name")).toBe(false);
    expect(result.has("category")).toBe(false);
  });

  test("should handle non-string deep insert annotation values", () => {
    const definition = {
      elements: {
        items: {
          type: "Association",
          "@mcp.deepInsert": true, // Not a string
        },
        addresses: {
          type: "Association",
          "@mcp.deepInsert": 123, // Not a string
        },
        contacts: {
          type: "Association",
          "@mcp.deepInsert": "ValidService.Contact", // Valid string
        },
      },
    } as any as csn.Definition;

    const result = parseDeepInsertRefs(definition);

    // Should only include valid string annotations
    expect(result.size).toBe(1);
    expect(result.get("contacts")).toBe("ValidService.Contact");
    expect(result.has("items")).toBe(false);
    expect(result.has("addresses")).toBe(false);
  });

  test("should handle empty string deep insert annotation", () => {
    const definition = {
      elements: {
        items: {
          type: "Association",
          "@mcp.deepInsert": "", // Empty string
        },
        addresses: {
          type: "Association",
          "@mcp.deepInsert": "ValidService.Address",
        },
      },
    } as any as csn.Definition;

    const result = parseDeepInsertRefs(definition);

    // Empty string is falsy, so should be ignored
    expect(result.size).toBe(1);
    expect(result.get("addresses")).toBe("ValidService.Address");
    expect(result.has("items")).toBe(false);
  });

  test("should handle null and undefined deep insert values", () => {
    const definition = {
      elements: {
        items: {
          type: "Association",
          "@mcp.deepInsert": null,
        },
        addresses: {
          type: "Association",
          "@mcp.deepInsert": undefined,
        },
        contacts: {
          type: "Association",
          "@mcp.deepInsert": "Service.Contact",
        },
      },
    } as any as csn.Definition;

    const result = parseDeepInsertRefs(definition);

    expect(result.size).toBe(1);
    expect(result.get("contacts")).toBe("Service.Contact");
  });

  test("should handle complex entity names with namespaces", () => {
    const definition = {
      elements: {
        orderItems: {
          type: "Association",
          "@mcp.deepInsert": "my.namespace.service.BookingService.OrderItem",
        },
        bookingItems: {
          type: "Association",
          "@mcp.deepInsert": "com.company.app.BookingService.BookingLineItem",
        },
      },
    } as any as csn.Definition;

    const result = parseDeepInsertRefs(definition);

    expect(result.size).toBe(2);
    expect(result.get("orderItems")).toBe(
      "my.namespace.service.BookingService.OrderItem",
    );
    expect(result.get("bookingItems")).toBe(
      "com.company.app.BookingService.BookingLineItem",
    );
  });

  test("should preserve property name case sensitivity", () => {
    const definition = {
      elements: {
        Items: {
          type: "Association",
          "@mcp.deepInsert": "Service.Item",
        },
        items: {
          type: "Association",
          "@mcp.deepInsert": "Service.SmallItem",
        },
        ITEMS: {
          type: "Association",
          "@mcp.deepInsert": "Service.BigItem",
        },
      },
    } as any as csn.Definition;

    const result = parseDeepInsertRefs(definition);

    expect(result.size).toBe(3);
    expect(result.get("Items")).toBe("Service.Item");
    expect(result.get("items")).toBe("Service.SmallItem");
    expect(result.get("ITEMS")).toBe("Service.BigItem");
  });

  test("should work with both Composition and Association types", () => {
    const definition = {
      elements: {
        orderItems: {
          type: "Composition",
          target: "OrderItem",
          "@mcp.deepInsert": "Service.OrderItem",
        },
        customer: {
          type: "Association",
          target: "Customer",
          "@mcp.deepInsert": "Service.Customer",
        },
      },
    } as any as csn.Definition;

    const result = parseDeepInsertRefs(definition);

    expect(result.size).toBe(2);
    expect(result.get("orderItems")).toBe("Service.OrderItem");
    expect(result.get("customer")).toBe("Service.Customer");
  });

  test("should handle elements with special characters in property names", () => {
    const definition = {
      elements: {
        "order-items": {
          type: "Association",
          "@mcp.deepInsert": "Service.OrderItem",
        },
        customer_address: {
          type: "Association",
          "@mcp.deepInsert": "Service.Address",
        },
      },
    } as any as csn.Definition;

    const result = parseDeepInsertRefs(definition);

    expect(result.size).toBe(2);
    expect(result.get("order-items")).toBe("Service.OrderItem");
    expect(result.get("customer_address")).toBe("Service.Address");
  });

  test("should handle whitespace in target entity names", () => {
    const definition = {
      elements: {
        items: {
          type: "Association",
          "@mcp.deepInsert": "  Service.Item  ", // With whitespace
        },
      },
    } as any as csn.Definition;

    const result = parseDeepInsertRefs(definition);

    // Should include the value as-is (with whitespace)
    expect(result.size).toBe(1);
    expect(result.get("items")).toBe("  Service.Item  ");
  });

  test("should handle definition with only non-deep-insert elements", () => {
    const definition = {
      elements: {
        id: { type: "cds.UUID", key: true },
        name: { type: "cds.String" },
        description: { type: "cds.String" },
        price: { type: "cds.Decimal" },
      },
    } as any as csn.Definition;

    const result = parseDeepInsertRefs(definition);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  test("should handle very long property and entity names", () => {
    const definition = {
      elements: {
        veryLongAssociationPropertyNameThatExceedsNormalLength: {
          type: "Association",
          "@mcp.deepInsert":
            "very.long.namespace.service.name.VeryLongEntityName",
        },
      },
    } as any as csn.Definition;

    const result = parseDeepInsertRefs(definition);

    expect(result.size).toBe(1);
    expect(
      result.get("veryLongAssociationPropertyNameThatExceedsNormalLength"),
    ).toBe("very.long.namespace.service.name.VeryLongEntityName");
  });

  test("should handle element with multiple annotations including deep insert", () => {
    const definition = {
      elements: {
        items: {
          type: "Association",
          target: "Item",
          "@mcp.deepInsert": "Service.Item",
          "@UI.Hidden": true,
          "@Core.Description": "Order items",
          cardinality: { max: "*" },
        },
      },
    } as any as csn.Definition;

    const result = parseDeepInsertRefs(definition);

    expect(result.size).toBe(1);
    expect(result.get("items")).toBe("Service.Item");
  });
});
