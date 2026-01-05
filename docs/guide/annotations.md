# Annotations Reference

Complete reference for all `@mcp` annotations supported by the CAP MCP Plugin.

## Overview

The plugin uses CDS annotations to configure MCP server behavior. All annotations use the `@mcp` prefix and follow standard CDS annotation syntax.

**Available annotation types**:
- `@mcp` - Main annotation for resources and tools
- `@mcp.resource` - Shorthand for resource configuration
- `@mcp.tool` - Shorthand for tool configuration
- `@mcp.prompts` - Service-level prompt templates
- `@mcp.wrap` - Entity wrapper configuration
- `@mcp.hint` - Field-level descriptions
- `@mcp.omit` - Hide fields from MCP responses

## @mcp (Main Annotation)

The primary annotation for configuring MCP resources and tools.

### For Resources (Entities)

**Syntax**:
```cds
@mcp: {
  name       : String,        // Required
  description: String,        // Optional
  resource   : Boolean | Array<String>  // Required for resources
}
entity EntityName { /* ... */ }
```

**Example - All Query Options**:
```cds
@mcp: {
  name       : 'books',
  description: 'Book catalog with search and filtering',
  resource   : true  // Enable all OData query parameters
}
entity Books as projection on my.Books;
```

**Example - Specific Query Options**:
```cds
@mcp: {
  name       : 'books',
  description: 'Book data list',
  resource   : ['filter', 'orderby', 'select', 'skip', 'top']
}
entity Books as projection on my.Books;
```

**Example - No Query Options**:
```cds
@mcp: {
  name       : 'genres',
  description: 'Fixed genre list',
  resource   : []  // No query parameters, static dataset
}
entity Genres as projection on my.Genres;
```

**Available query options**:
- `filter` - OData $filter expressions
- `orderby` - OData $orderby sorting
- `select` - OData $select field selection
- `top` - OData $top result limit
- `skip` - OData $skip pagination offset

See [Resources Guide](guide/resources.md) for details.

### For Tools (Functions/Actions)

**Syntax**:
```cds
@mcp: {
  name       : String,        // Required
  description: String,        // Optional
  tool       : Boolean,       // Required (true)
  elicit     : Array<String>  // Optional
}
function functionName(/* params */) returns /* type */;
```

**Example - Basic Tool**:
```cds
@mcp: {
  name       : 'get-author',
  description: 'Gets the desired author',
  tool       : true
}
function getAuthor(input: String) returns String;
```

**Example - With Elicitation**:
```cds
@mcp: {
  name       : 'book-recommendation',
  description: 'Get a random book recommendation',
  tool       : true,
  elicit     : ['confirm']  // Request user confirmation
}
function getBookRecommendation() returns String;
```

**Elicitation types**:
- `['confirm']` - Request user confirmation before execution
- `['input']` - Prompt user for parameter values
- `['input', 'confirm']` - Request input, then confirmation

See [Tools Guide](guide/tools.md) for details.

## @mcp.resource (Shorthand)

Simplified syntax for resource-only configuration.

**Syntax**:
```cds
@mcp.resource: Boolean | Array<String>
entity EntityName { /* ... */ }
```

**Examples**:
```cds
// All query options
@mcp.resource: true
entity Books as projection on my.Books;

// Specific options
@mcp.resource: ['filter', 'top']
entity Books as projection on my.Books;

// No query options
@mcp.resource: []
entity Genres as projection on my.Genres;
```

**Equivalent to**:
```cds
@mcp: {
  name: 'Books',  // Inferred from entity name
  resource: true
}
```

## @mcp.tool (Shorthand)

Simplified syntax for tool-only configuration.

**Syntax**:
```cds
@mcp.tool: Boolean
function functionName(/* params */) returns /* type */;
```

**Example**:
```cds
@mcp.tool: true
function getAuthor(input: String) returns String;
```

**Equivalent to**:
```cds
@mcp: {
  name: 'getAuthor',  // Inferred from function name
  tool: true
}
```

## @mcp.prompts (Service-Level)

Define reusable prompt templates at the service level.

**Syntax**:
```cds
annotate ServiceName with @mcp.prompts: [
  {
    name       : String,          // Required
    title      : String,          // Optional
    description: String,          // Optional
    template   : String,          // Required
    role       : 'user' | 'assistant',  // Optional, default: 'user'
    inputs     : Array<{          // Optional
      key : String,
      type: String
    }>
  }
];
```

**Example**:
```cds
annotate CatalogService with @mcp.prompts: [{
  name       : 'give-me-book-abstract',
  title      : 'Book Abstract',
  description: 'Gives an abstract of a book based on the title',
  template   : 'Search the internet and give me an abstract of the book {{book-id}}',
  role       : 'user',
  inputs     : [{
    key : 'book-id',
    type: 'String'
  }]
}];
```

**Input types**: `String`, `Integer`, `Decimal`, `Boolean`, `Date`, `DateTime`

**Template variables**: Use `{{variable}}` syntax for parameter substitution

See [Prompts Guide](guide/prompts.md) for details.

## @mcp.wrap (Entity Wrappers)

Configure entity wrapper tools for CRUD operations.

**Syntax**:
```cds
annotate ServiceName.EntityName with @mcp.wrap: {
  tools: Boolean,           // Required
  modes: Array<String>,     // Optional, default: ['query', 'get']
  hint : String             // Optional
};
```

**Example - Read-Only**:
```cds
annotate CatalogService.Books with @mcp.wrap: {
  tools: true,
  modes: ['query', 'get'],
  hint : 'Use for read-only lookups of books'
};
```

**Example - Full CRUD**:
```cds
annotate CatalogService.Books with @mcp.wrap: {
  tools: true,
  modes: ['query', 'get', 'create', 'update', 'delete'],
  hint : 'Full CRUD operations for book management'
};
```

**Available modes**:
- `query` - List and search with filters
- `get` - Retrieve by ID
- `create` - Insert new records
- `update` - Modify existing records
- `delete` - Remove records

**Generated tool names**: `ServiceName_EntityName_mode`
- Example: `CatalogService_Books_query`

See [Entity Wrappers Guide](guide/entity-wrappers.md) for details.

## @mcp.hint (Field-Level)

Provide descriptive hints for entity properties and function parameters.

**Syntax**:
```cds
propertyName: Type @mcp.hint: String;
```

**Examples**:

**Entity properties**:
```cds
entity Books {
  key ID    : Integer @mcp.hint: 'Must be a unique number not already in the system';
      title : String  @mcp.hint: 'Full book title as it appears on the cover';
      stock : Integer @mcp.hint: 'The amount of books currently on store shelves';
}
```

**Function parameters**:
```cds
function getBooksByAuthor(
  authorName : String @mcp.hint: 'Full name of the author you want to get the books of'
) returns array of String;
```

**Arrays**:
```cds
entity Authors {
  nominations : array of String @mcp.hint: 'Awards that the author has been nominated for';
}
```

**Complex types**:
```cds
type TValidQuantities {
  positiveOnly : Integer @mcp.hint: 'Only takes in positive numbers, i.e. no negative values such as -1';
};
```

See [Field Hints Guide](guide/field-hints.md) for best practices.

## @mcp.omit (Data Privacy)

Hide sensitive fields from all MCP responses.

**Syntax**:
```cds
propertyName: Type @mcp.omit;
```

**Examples**:

**Security-sensitive**:
```cds
entity Books {
  key ID            : Integer;
      title         : String;
      secretMessage : String  @mcp.omit;  // Hidden from MCP
}
```

**Personal data**:
```cds
entity Users {
  key ID           : Integer;
      username     : String;
      passwordHash : String  @mcp.omit;  // Never exposed
      ssn          : String  @mcp.omit;  // Protected
}
```

**Business sensitive**:
```cds
entity Products {
  key ID        : Integer;
      name      : String;
      price     : Decimal;
      costPrice : Decimal @mcp.omit;  // Hide internal pricing
}
```

**How it works**:
- Omitted fields excluded from **outputs** (responses)
- Omitted fields can still be provided as **inputs** (create/update)
- Applies to resources, entity wrappers, and tool responses

See [Data Privacy Guide](guide/data-privacy.md) for details.

## @mcp.deepInsert (Deep Insert)

Enable creating parent and child entities in a single operation.

**Syntax**:
```cds
associationProperty: Association to TargetEntity @mcp.deepInsert: 'TargetEntityName';
```

**Example**:
```cds
entity Bookings {
  key ID : UUID;
  customerName : String;
  
  @mcp.deepInsert: 'BookingItems'
  items : Association to many BookingItems on items.booking = $self;
}

entity BookingItems {
  key ID : UUID;
  booking : Association to Bookings;
  product : String;
  quantity : Integer;
}
```

**How it works**:
- Annotate associations that should support nested creation
- Pass an array of child objects when calling create/update tools
- CAP handles the nested insert automatically

**Generated tool schema**:
```typescript
// Instead of foreign key (items_ID), you get:
items: z.array(z.object({
  product: z.string().optional(),
  quantity: z.number().optional()
})).optional()
```

**Usage**:
```typescript
CatalogService_Bookings_create({
  customerName: "John Doe",
  items: [
    { product: "Widget A", quantity: 5 },
    { product: "Widget B", quantity: 3 }
  ]
})
```

**Common use cases**:
- Order + Line Items
- Invoice + Invoice Lines
- Project + Tasks
- Document + Attachments

**Limitations**:
- Only one level of nesting supported
- Requires entity wrappers (`@mcp.wrap`) with `create` or `update` modes
- Skips computed fields and nested associations in child entities

See [Entity Wrappers Guide](guide/entity-wrappers.md) for wrapper configuration.

## Combining Annotations

Annotations can be combined for comprehensive configuration.

### Resource + Wrapper + Hints + Privacy

```cds
@mcp: {
  name       : 'books',
  description: 'Book catalog',
  resource   : ['filter', 'orderby', 'top']
}
entity Books {
  key ID            : Integer @mcp.hint: 'Unique book identifier';
      title         : String  @mcp.hint: 'Full book title';
      stock         : Integer @mcp.hint: 'Current inventory count';
      secretMessage : String  @mcp.omit;  // Hidden
}

annotate CatalogService.Books with @mcp.wrap: {
  tools: true,
  modes: ['query', 'get'],
  hint : 'Read-only book lookups'
};
```

**Result**:
- Resource with filter/orderby/top query options
- Entity wrapper tools (query, get)
- Field hints on all properties
- `secretMessage` hidden from all responses

### Tool + Elicitation + Parameter Hints

```cds
@mcp: {
  name       : 'books-by-author',
  description: 'Gets a list of books made by the author',
  tool       : true,
  elicit     : ['input', 'confirm']
}
function getBooksByAuthor(
  authorName : String @mcp.hint: 'Full name of the author you want to get the books of',
  limit      : Integer @mcp.hint: 'Maximum number of books to return (1-100)'
) returns array of String;
```

**Result**:
- Executable tool with elicitation
- Enhanced parameter descriptions from hints

## Annotation Validation

The plugin validates annotations at startup:

### Valid Annotation

```cds
@mcp: {
  name: 'books',
  resource: true
}
entity Books as projection on my.Books;
```

**Result**: ✅ Annotation parsed successfully

### Invalid Annotation - Missing Required Property

```cds
@mcp: {
  description: 'Books'
  // Missing: name
}
entity Books as projection on my.Books;
```

**Result**: ❌ Error: `name` is required for @mcp annotation

### Invalid Annotation - Wrong Type

```cds
@mcp: {
  name: 'books',
  resource: 'true'  // Should be Boolean or Array
}
entity Books as projection on my.Books;
```

**Result**: ❌ Error: `resource` must be Boolean or Array<String>

## Annotation Best Practices

### 1. Always Provide Descriptions

```cds
// ✅ Good
@mcp: {
  name       : 'books',
  description: 'Book catalog with search and filtering',
  resource   : true
}

// ❌ Avoid
@mcp: {
  name    : 'books',
  resource: true
  // No description
}
```

### 2. Use Meaningful Names

```cds
// ✅ Good
@mcp: { name: 'search-books-by-author', tool: true }

// ❌ Avoid
@mcp: { name: 'func1', tool: true }
```

### 3. Combine Hints Generously

```cds
// ✅ Good
entity Books {
  key ID    : Integer @mcp.hint: 'Unique book identifier';
      title : String  @mcp.hint: 'Full book title';
      stock : Integer @mcp.hint: 'Current inventory count';
}

// ❌ Avoid
entity Books {
  key ID    : Integer;
  title     : String;
  stock     : Integer;
  // No hints
}
```

### 4. Protect Sensitive Data

```cds
// ✅ Good
entity Users {
  key ID       : Integer;
      username : String;
      password : String @mcp.omit;  // Protected
}

// ⚠️ Risk
entity Users {
  key ID       : Integer;
      username : String;
      password : String;  // Exposed to MCP!
}
```

### 5. Use Projections

```cds
// ✅ Good: Use projections
@mcp.resource: true
entity PublicBooks as projection on my.Books {
  *,
  excluding { internalNotes }
};

// ❌ Avoid: Exposing base entities
@mcp.resource: true
entity Books { /* base entity */ }
```

## Quick Reference Table

| Annotation | Target | Purpose | Example |
|------------|--------|---------|---------|
| `@mcp` | Entity | Create resource | `@mcp: { name: 'books', resource: true }` |
| `@mcp` | Function/Action | Create tool | `@mcp: { name: 'get-author', tool: true }` |
| `@mcp.resource` | Entity | Resource shorthand | `@mcp.resource: true` |
| `@mcp.tool` | Function/Action | Tool shorthand | `@mcp.tool: true` |
| `@mcp.prompts` | Service | Define prompts | `@mcp.prompts: [{ name: 'prompt1', ... }]` |
| `@mcp.wrap` | Entity | Entity wrappers | `@mcp.wrap: { tools: true, modes: ['query'] }` |
| `@mcp.hint` | Property/Parameter | Field description | `@mcp.hint: 'Description here'` |
| `@mcp.omit` | Property | Hide from MCP | `@mcp.omit` |
| `@mcp.deepInsert` | Association | Enable deep insert | `@mcp.deepInsert: 'TargetEntity'` |

## Related Topics

- [Resources →](guide/resources.md) - Resource annotation details
- [Tools →](guide/tools.md) - Tool annotation details
- [Prompts →](guide/prompts.md) - Prompt template details
- [Entity Wrappers →](guide/entity-wrappers.md) - Wrapper configuration
- [Field Hints →](guide/field-hints.md) - Hint best practices
- [Data Privacy →](guide/data-privacy.md) - Omission usage
- [CDS Annotations](https://cap.cloud.sap/docs/cds/annotations) - CAP annotation system
