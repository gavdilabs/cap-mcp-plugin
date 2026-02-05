# Entity Wrappers

Expose CAP entities as structured MCP tools for CRUD operations (query, get, create, update, delete).

## What Are Entity Wrappers?

Entity wrappers automatically generate MCP tools that allow AI agents to perform structured operations on your CAP entities. Unlike resources (which use OData queries), entity wrapper tools provide explicit, validated operations.

**Key Difference**:
- **Resources**: Natural language OData queries ("Find books by King")
- **Entity Wrappers**: Structured tool calls (`CatalogService_Books_query` with parameters)

Both can coexist - resources for browsing, wrappers for precise operations.

## Generated Tools

For an annotated entity like `CatalogService.Books`, the plugin can generate:

| Tool Name | Operation | Description |
|-----------|-----------|-------------|
| `CatalogService_Books_query` | List/search | Query with select/where/orderby/top/skip |
| `CatalogService_Books_get` | Retrieve by ID | Get one record by key(s) |
| `CatalogService_Books_create` | Insert | Create a new record |
| `CatalogService_Books_update` | Modify | Update an existing record |
| `CatalogService_Books_delete` | Remove | Delete a record by key(s) |

**Naming Convention**: `Service_Entity_Mode` - intentionally descriptive for both humans and AI agents.

### Custom Tool Naming

Customize the tool name prefix using `@mcp.wrap.name`:

```cds
annotate CatalogService.Books with @mcp.wrap: {
  tools: true,
  name: 'BookCatalog',
  modes: ['query', 'get']
};
```

**Result**: Generates `BookCatalog_query` and `BookCatalog_get` instead of `CatalogService_Books_query` and `CatalogService_Books_get`.

**Use cases**:
- Shorter, more concise tool names
- Abstract away internal entity names
- Align tool names with business terminology


## Enabling Entity Wrappers

### Global Configuration

Enable wrappers for all entities in `package.json`:

```json
{
  "cds": {
    "mcp": {
      "wrap_entities_to_actions": true,
      "wrap_entity_modes": ["query", "get"]
    }
  }
}
```

**Result**: All entities with `@mcp` annotations get `query` and `get` tools.

**Recommended default**: Start with read-only modes (`query`, `get`), opt into write modes per entity.

### Per-Entity Configuration

Override global settings for specific entities:

```cds
entity Books as projection on my.Books;

annotate CatalogService.Books with @mcp.wrap: {
  tools: true,
  modes: ['query', 'get', 'create', 'update'],
  hint: 'Use for read and write operations on book catalog'
};
```

**Precedence Rules**:
1. `@mcp.wrap.tools` on entity overrides global `wrap_entities_to_actions`
2. `@mcp.wrap.modes` on entity overrides global `wrap_entity_modes`
3. If not specified, falls back to global config

### Read-Only Wrappers

For query and retrieval only:

```cds
annotate CatalogService.Books with @mcp.wrap: {
  tools: true,
  modes: ['query', 'get'],
  hint: 'Read-only access to book catalog'
};
```

### Full CRUD Wrappers

Enable all operations:

```cds
annotate CatalogService.Books with @mcp.wrap: {
  tools: true,
  modes: ['query', 'get', 'create', 'update', 'delete'],
  hint: 'Full CRUD operations for book management'
};
```

⚠️ **Security Note**: Only enable write operations (`create`, `update`, `delete`) where appropriate. Combine with CAP authorization.

## Tool Operations

### Query Operation

List and search records with structured parameters:

```typescript
CatalogService_Books_query({
  select: ['ID', 'title', 'author_ID', 'stock'],
  where: 'stock > 0',
  orderby: 'title',
  top: 10,
  skip: 0
})
```

**Parameters** (all optional):
- `select`: Array of field names to retrieve
- `where`: Filter expression (e.g., `"stock > 10"`, `"title LIKE '%Dragon%'"`)
- `orderby`: Sort expression (e.g., `"title"`, `"price DESC"`)
- `top`: Limit results (max records)
- `skip`: Offset for pagination
- `q`: Simple text search across string fields
- `return`: Result format (`'rows'` | `'count'` | `'aggregate'`)
- `aggregate`: Aggregation expression (when `return: 'aggregate'`)

**Field Consistency**: Use foreign key fields (e.g., `author_ID`) for associations in both `select` and `where`.

### Get Operation

Retrieve a single record by key:

```typescript
// Single-key entity
CatalogService_Books_get({ ID: 123 })

// Shorthand for single key
CatalogService_Books_get(123)

// Multi-key entity
CatalogService_OrderItems_get({
  order_ID: 456,
  item_ID: 789
})
```

**Parameters**: Entity key field(s) required

### Create Operation

Insert a new record:

```typescript
CatalogService_Books_create({
  ID: 124,
  title: "New Book Title",
  author_ID: 42,      // Association via foreign key
  stock: 100,
  price: 29.99
})
```

**Parameters**: Entity fields as-is, associations via `<assoc>_ID`

**Note**: Omit computed fields (marked with `@Core.Computed`)

### Update Operation

Modify an existing record:

```typescript
CatalogService_Books_update({
  ID: 123,              // Key field required
  stock: 95,            // Updated fields
  price: 24.99
})
```

**Parameters**:
- Key field(s) required
- Non-key fields optional (only updated fields)
- Associations via `<assoc>_ID`

### Delete Operation

Remove a record:

```typescript
CatalogService_Books_delete({ ID: 123 })

// Shorthand for single key
CatalogService_Books_delete(123)
```

**Parameters**: Entity key field(s) required

⚠️ **Warning**: This operation cannot be undone.

### Deep Insert (Nested Creation)

Create parent and child entities atomically using `@mcp.deepInsert`:

**Configuration**:
```cds
entity Bookings {
  key ID : UUID;
  customerName : String;
  
  @mcp.deepInsert
  items : Association to many BookingItems on items.booking = $self;
}

entity BookingItems {
  key ID : UUID;
  booking : Association to Bookings;
  product : String;
  quantity : Integer;
}

annotate CatalogService.Bookings with @mcp.wrap: {
  tools: true,
  modes: ['create', 'update']
};
```

**Usage**:
```typescript
// Create booking with items in one call
CatalogService_Bookings_create({
  customerName: "John Doe",
  items: [
    { product: "Widget A", quantity: 5 },
    { product: "Widget B", quantity: 3 }
  ]
})

// Update booking and replace items
CatalogService_Bookings_update({
  ID: "booking-123",
  customerName: "Jane Doe",
  items: [
    { product: "Widget C", quantity: 10 }
  ]
})
```

**Requirements**:
- `@mcp.deepInsert` on association
- Entity wrappers enabled with `create` or `update` mode
- Target entity defined in the same service

**Benefits**:
- Atomic operation (all-or-nothing)
- Fewer API calls
- Automatic foreign key management
- Cleaner AI agent interactions

See [Annotations Reference](guide/annotations.md#mcpdeepinsert-deep-insert) for details.

## Advanced Query Features

### Count Results

Get total count without retrieving rows:

```typescript
CatalogService_Books_query({
  where: 'stock > 0',
  return: 'count'
})
// Returns: { count: 42 }
```

### Aggregations

Perform aggregations:

```typescript
CatalogService_Books_query({
  aggregate: 'SUM(stock) as totalStock, AVG(price) as avgPrice',
  return: 'aggregate'
})
// Returns: [{ totalStock: 1250, avgPrice: 22.45 }]
```

### Text Search

Simple text search across string fields:

```typescript
CatalogService_Books_query({
  q: 'dragon',     // Searches title, author, etc.
  top: 10
})
```

**How it works**: `q` performs `CONTAINS` search on all string fields.

## Adding Context with Hints

Use `@mcp.wrap.hint` to guide AI agents:

```cds
annotate CatalogService.Books with @mcp.wrap: {
  tools: true,
  modes: ['query', 'get'],
  hint: 'Use for read-only lookups of books. Query for lists, Get for single book by ID.'
};
```

**Result**: Hint is appended to all generated tool descriptions.

Combine with field-level hints using `@mcp.hint`:

```cds
entity Books {
  key ID    : Integer @mcp.hint: 'Unique book identifier';
  title     : String @mcp.hint: 'Book title, searchable';
  stock     : Integer @mcp.hint: 'Current inventory count';
  author_ID : Integer @mcp.hint: 'Foreign key to Authors.ID';
}
```

See [Field Hints Guide](guide/field-hints.md) for more.

## Model Discovery Tool

The plugin automatically provides a `cap_describe_model` tool to help AI agents understand your data model:

```typescript
cap_describe_model({
  service: 'CatalogService',
  entity: 'Books',
  format: 'detailed'
})
```

**Returns**:
- Entity fields with types
- Key fields
- Associations
- Example tool calls with payloads
- Available operations

**Use cases**:
- AI agent discovers entity structure
- AI agent learns what operations are available
- AI agent sees example queries

## Best Practices

### Start with Read-Only

```json
{
  "cds": {
    "mcp": {
      "wrap_entities_to_actions": true,
      "wrap_entity_modes": ["query", "get"]
    }
  }
}
```

**Why**: Safer default, opt into writes per entity.

### Use Hints Generously

```cds
annotate CatalogService.Books with @mcp.wrap: {
  tools: true,
  modes: ['query', 'get', 'update'],
  hint: 'Books catalog. Query for search, Get for single book, Update to modify stock/price only.'
};
```

**Why**: Clear guidance improves AI agent decisions.

### Combine with Authorization

```cds
@restrict: [
  { grant: 'READ', to: 'Viewer' },
  { grant: ['READ', 'WRITE'], to: 'Admin' }
]
entity Books as projection on my.Books;

annotate CatalogService.Books with @mcp.wrap: {
  tools: true,
  modes: ['query', 'get', 'create', 'update']
};
```

**Result**: MCP clients inherit CAP authorization - only admins can create/update.

Learn more: [CAP Authorization](https://cap.cloud.sap/docs/guides/security/authorization)

### Hide Sensitive Fields

Use `@mcp.omit` to exclude sensitive data:

```cds
entity Books {
  key ID            : Integer;
  title             : String;
  internalCostPrice : Decimal @mcp.omit;  // Hidden from MCP
}
```

See [Data Privacy Guide](guide/data-privacy.md).

### Limit Delete Operations

```cds
// Only enable delete for entities that truly need it
annotate CatalogService.Logs with @mcp.wrap: {
  tools: true,
  modes: ['delete'],
  hint: 'Use to clean up old log entries only'
};
```

## Security Considerations

### Authentication

Entity wrapper tools inherit CAP authentication:

```json
{
  "cds": {
    "mcp": {
      "auth": "inherit"  // Use CAP authentication
    }
  }
}
```

### Authorization

Tools execute in the current user's context:

```cds
@restrict: [
  { grant: 'READ', to: 'authenticated-user' },
  { grant: 'WRITE', to: 'admin' }
]
entity Books as projection on my.Books;
```

**Result**: Non-admin users can query/get but not create/update/delete.

### Timeout

All tool operations have a standard timeout to prevent long-running queries.

## Logging and Debugging

Enable debug logging:

```json
{
  "cds": {
    "log": {
      "levels": {
        "mcp": "debug"
      }
    }
  }
}
```

**Log output includes**:
- Tool registration
- Execution time
- Parameter validation
- Errors and warnings

## Related Topics

- [Resources →](guide/resources.md) - OData-based querying
- [Field Hints →](guide/field-hints.md) - Enhance field descriptions
- [Data Privacy →](guide/data-privacy.md) - Hide sensitive fields
- [Configuration →](guide/configuration.md) - Global wrapper settings
- [Authentication →](guide/authentication.md) - Secure tool access
