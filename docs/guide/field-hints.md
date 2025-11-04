# Field Hints

Provide contextual descriptions for entity properties and function parameters using `@mcp.hint`.

## What Are Field Hints?

Field hints are descriptive annotations that help AI agents understand the purpose, constraints, and expected values for specific fields. Using `@mcp.hint`, you can provide inline documentation that appears in tool parameter schemas and entity descriptions.

## Where to Use Hints

### Entity Properties

Add hints to entity fields:

```cds
entity Books {
  key ID    : Integer @mcp.hint: 'Must be a unique number not already in the system';
      title : String  @mcp.hint: 'Full book title as it appears on the cover';
      stock : Integer @mcp.hint: 'The amount of books currently on store shelves';
      price : Decimal @mcp.hint: 'Price in EUR including VAT';
}
```

**Result**: When AI agents use entity wrapper tools, they see these hints in parameter descriptions.

### Array Elements

Hint array types:

```cds
entity Authors {
  key ID          : Integer;
      name        : String @mcp.hint: 'Full name of the author';
      nominations : array of String @mcp.hint: 'Awards that the author has been nominated for';
}
```

### Function Parameters

Enhance function parameter descriptions:

```cds
@mcp: {
  name       : 'books-by-author',
  description: 'Gets a list of books made by the author',
  tool       : true
}
function getBooksByAuthor(
  authorName : String @mcp.hint: 'Full name of the author you want to get the books of'
) returns array of String;
```

**Result**: AI agents see the hint when calling the tool, helping them provide correct parameter values.

### Complex Type Fields

Add hints to custom types:

```cds
type TValidQuantities {
  positiveOnly : Integer @mcp.hint: 'Only takes in positive numbers, i.e. no negative values such as -1';
}

entity Inventory {
  key ID       : Integer;
      quantity : TValidQuantities;
}
```

## How Hints Are Used

Hints are automatically incorporated into:

1. **Resource Descriptions**: Field-level guidance for entity resources
2. **Entity Wrapper Tools**: Enhanced parameter descriptions in CRUD tools (query/get/create/update)
3. **Tool Parameter Schemas**: Context for AI agents when constructing function calls
4. **Input Validation**: Guidance for AI agents to provide correct values

### Example: Without Hints

```json
{
  "tool": "CatalogService_Books_create",
  "inputSchema": {
    "type": "object",
    "properties": {
      "ID": { "type": "integer" },
      "stock": { "type": "integer" }
    }
  }
}
```

AI agents only see type information.

### Example: With Hints

```json
{
  "tool": "CatalogService_Books_create",
  "inputSchema": {
    "type": "object",
    "properties": {
      "ID": {
        "type": "integer",
        "description": "Must be a unique number not already in the system"
      },
      "stock": {
        "type": "integer",
        "description": "The amount of books currently on store shelves"
      }
    }
  }
}
```

AI agents have clear guidance on what values to provide.

## Best Practices

### 1. Be Specific

Provide concrete examples and constraints:

```cds
// ❌ Bad: Too vague
author: String @mcp.hint: 'Author name';

// ✅ Good: Clear and specific
author: String @mcp.hint: 'Full name of the author (e.g., "Ernest Hemingway")';
```

### 2. Include Constraints

Document validation rules and business logic:

```cds
// ✅ Good: Explicit constraints
stock: Integer @mcp.hint: 'Must be between 0 and 999, representing quantity in stock';
price: Decimal @mcp.hint: 'Price in EUR including VAT, must be greater than 0';
```

### 3. Clarify Foreign Keys

Help AI agents understand associations:

```cds
entity Books {
  key ID        : Integer @mcp.hint: 'Unique book identifier';
      title     : String;
      author_ID : Integer @mcp.hint: 'Foreign key reference to Authors.ID - use Authors_get to fetch details';
}
```

### 4. Explain Business Context

Add domain-specific information:

```cds
entity Books {
  key ID   : Integer @mcp.hint: 'Unique book identifier';
      ISBN : String @mcp.hint: 'ISBN-13 format (13 digits), used for unique book identification worldwide';
      stock: Integer @mcp.hint: 'Current inventory count across all warehouses, 0 means out of stock';
}
```

### 5. Avoid Redundancy

Don't repeat what's obvious from the field name and type:

```cds
// ❌ Bad: Redundant
stock: Integer @mcp.hint: 'Stock value';

// ✅ Good: Adds context
stock: Integer @mcp.hint: 'Current inventory count across all warehouses';
```

## Common Use Cases

### Validation Constraints

```cds
entity Products {
  key ID       : Integer @mcp.hint: 'Auto-generated unique identifier';
      quantity : Integer @mcp.hint: 'Must be non-negative, typically 0-9999';
      discount : Decimal @mcp.hint: 'Percentage discount, 0-100';
      status   : String  @mcp.hint: 'Must be one of: ACTIVE, DISCONTINUED, OUT_OF_STOCK';
}
```

### Data Formats

```cds
entity Customers {
  key ID        : Integer @mcp.hint: 'Unique customer ID';
      email     : String  @mcp.hint: 'Valid email address format (e.g., user@example.com)';
      phone     : String  @mcp.hint: 'International format with country code (e.g., +1-555-123-4567)';
      birthDate : Date    @mcp.hint: 'ISO 8601 format (YYYY-MM-DD)';
}
```

### Enum-Like Values

```cds
entity Orders {
  key ID         : Integer @mcp.hint: 'Unique order identifier';
      status     : String  @mcp.hint: 'Order status: PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED';
      priority   : String  @mcp.hint: 'Priority level: LOW, MEDIUM, HIGH, URGENT';
      shipMethod : String  @mcp.hint: 'Shipping method: STANDARD, EXPRESS, OVERNIGHT, PICKUP';
}
```

### Business Rules

```cds
entity Inventory {
  key ID          : Integer @mcp.hint: 'Unique inventory record ID';
      product_ID  : Integer @mcp.hint: 'Foreign key to Products.ID';
      warehouse   : String  @mcp.hint: 'Warehouse code (3 uppercase letters, e.g., NYC, LAX)';
      reorderPoint: Integer @mcp.hint: 'Stock level that triggers automatic reorder, typically 10-20% of max capacity';
}
```

### Calculated or Derived Fields

```cds
entity Books {
  key ID            : Integer @mcp.hint: 'Unique book identifier';
      price         : Decimal @mcp.hint: 'Base price in EUR';
      discountPrice : Decimal @mcp.hint: 'Final price after discount (read-only, calculated from price and discount)';
}
```

## Hints with Entity Wrappers

When entity wrappers are enabled, hints enhance all generated tools:

```cds
entity Books {
  key ID    : Integer @mcp.hint: 'Unique book identifier';
      title : String  @mcp.hint: 'Full book title';
      stock : Integer @mcp.hint: 'Current inventory count, 0 means out of stock';
}

annotate CatalogService.Books with @mcp.wrap: {
  tools: true,
  modes: ['query', 'get', 'create', 'update']
};
```

**Generated tools**:
- `CatalogService_Books_query` - Hints appear in select/where parameter docs
- `CatalogService_Books_get` - Hints on ID parameter
- `CatalogService_Books_create` - Hints on all input fields
- `CatalogService_Books_update` - Hints on updateable fields

See [Entity Wrappers Guide](guide/entity-wrappers.md) for more.

## Hints with Resources

Hints also enhance resource descriptions:

```cds
@mcp: {
  name: 'books',
  description: 'Book catalog',
  resource: true
}
entity Books {
  key ID    : Integer @mcp.hint: 'Unique book identifier';
      title : String  @mcp.hint: 'Book title, searchable with $filter';
      stock : Integer @mcp.hint: 'Current stock level';
}
```

AI agents querying the resource see field hints, helping them construct better OData queries.

## Technical Implementation

### Parsing

Hints are parsed at model load time and stored in the `propertyHints` map:

```typescript
{
  'Books.ID': 'Unique book identifier',
  'Books.title': 'Book title, searchable with $filter',
  'Books.stock': 'Current stock level'
}
```

### Type Support

Hints work with:
- Simple types (String, Integer, Decimal, Boolean, Date, DateTime)
- Arrays
- Complex types
- Associations (use to explain foreign keys)

### Array Hints

Array element hints apply to the array items, not the array container:

```cds
nominations: array of String @mcp.hint: 'Award name';
// Hint describes each award name, not the array itself
```

## Combining Hints with Other Annotations

### With @mcp.omit

```cds
entity Users {
  key ID            : Integer @mcp.hint: 'Unique user ID';
      username      : String  @mcp.hint: 'Username for login (3-20 alphanumeric characters)';
      passwordHash  : String  @mcp.omit;  // No hint needed, field is hidden
      email         : String  @mcp.hint: 'User email address, must be unique';
}
```

See [Data Privacy Guide](guide/data-privacy.md) for `@mcp.omit`.

### With @readonly

```cds
entity Books {
  key ID        : Integer @mcp.hint: 'Unique book identifier';
      createdAt : DateTime @readonly @mcp.hint: 'Creation timestamp (auto-generated, read-only)';
      updatedAt : DateTime @readonly @mcp.hint: 'Last update timestamp (auto-generated, read-only)';
}
```

### With @mandatory

```cds
entity Books {
  key ID    : Integer @mcp.hint: 'Unique book identifier';
      title : String @mandatory @mcp.hint: 'Book title (required, max 200 characters)';
      ISBN  : String @mandatory @mcp.hint: 'ISBN-13 format (required for publication)';
}
```

## Testing Hints

Use the MCP Inspector to verify hints are working:

```bash
npm run inspect
```

1. Connect to your MCP server
2. List tools (including entity wrappers)
3. View tool schemas - hints should appear in parameter descriptions
4. Test tool execution - AI agent uses hints for guidance

## Related Topics

- [Entity Wrappers →](guide/entity-wrappers.md) - CRUD tools that use hints
- [Resources →](guide/resources.md) - Resources with field hints
- [Tools →](guide/tools.md) - Function parameter hints
- [Data Privacy →](guide/data-privacy.md) - Hide fields with `@mcp.omit`
