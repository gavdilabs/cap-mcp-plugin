# Resource Annotations

Transform CAP entities into AI-queryable MCP resources with OData v4 query capabilities.

## What Are Resources?

In MCP, **resources** represent queryable data sources that AI agents can access. When you annotate a CAP entity with `@mcp.resource`, the plugin automatically exposes it as an MCP resource with full OData v4 query support.

For more on MCP resources, see the [official MCP Resources specification](https://modelcontextprotocol.io/docs/concepts/resources).

## Basic Resource Annotation

### Enable Specific Query Options

Define exactly which OData query parameters are available:

```cds
service CatalogService {

  @readonly
  @mcp: {
    name       : 'books',
    description: 'Book data list',
    resource   : [
      'filter',
      'orderby',
      'select',
      'skip',
      'top'
    ]
  }
  entity Books as projection on my.Books;
}
```

**Result**: AI agents can query books using the specified OData parameters.

### Enable All Query Options

Use `true` to enable all OData v4 query parameters:

```cds
@mcp: {
  name       : 'authors',
  description: 'Author data list',
  resource   : true
}
entity Authors as projection on my.Authors;
```

**Enabled parameters**:
- `$filter` - Filter expressions
- `$orderby` - Sorting
- `$select` - Field selection
- `$top` - Limit results
- `$skip` - Pagination offset

### Static Resource (No Query Parameters)

Return a fixed dataset without query capabilities:

```cds
@mcp: {
  name       : 'genres',
  description: 'Book genre list',
  resource   : []
}
entity Genres as projection on my.Genres;
```

**Result**: Returns all genre records without filtering or sorting options.

## OData Query Capabilities

Resources created with the plugin support full OData v4 query syntax.

### Filtering (`$filter`)

```cds
@mcp: {
  name: 'books',
  resource: ['filter']
}
entity Books as projection on my.Books;
```

**Example queries**:
- "Find books by Stephen King" → `$filter=contains(author,'King')`
- "Books with stock > 20" → `$filter=stock gt 20`
- "Books under $15" → `$filter=price lt 15`

**Supported operators**: `eq`, `ne`, `lt`, `le`, `gt`, `ge`, `contains`, `startswith`, `endswith`

Learn more: [OData Filter Expressions](https://cap.cloud.sap/docs/advanced/odata#filter)

### Ordering (`$orderby`)

```cds
@mcp: {
  name: 'books',
  resource: ['orderby']
}
entity Books as projection on my.Books;
```

**Example queries**:
- "Sort by title" → `$orderby=title`
- "Highest price first" → `$orderby=price desc`
- "Sort by author, then title" → `$orderby=author,title`

### Field Selection (`$select`)

```cds
@mcp: {
  name: 'books',
  resource: ['select']
}
entity Books as projection on my.Books;
```

**Example queries**:
- "Show only titles and prices" → `$select=title,price`
- "Get book IDs" → `$select=ID`

**Benefits**: Reduces payload size, improves performance

### Pagination (`$top`, `$skip`)

```cds
@mcp: {
  name: 'books',
  resource: ['top', 'skip']
}
entity Books as projection on my.Books;
```

**Example queries**:
- "First 10 books" → `$top=10`
- "Skip first 20, get next 10" → `$skip=20&$top=10`
- "Page 3 of results (10 per page)" → `$skip=20&$top=10`

## Combined Query Examples

Enable multiple parameters for powerful queries:

```cds
@mcp: {
  name: 'books',
  description: 'Book catalog with search and filtering',
  resource: ['filter', 'orderby', 'select', 'top', 'skip']
}
entity Books as projection on my.Books;
```

**Complex queries**:
```
// Available books, sorted by price, show only title and price, first 5 results
$filter=stock gt 0&$orderby=price&$select=title,price&$top=5

// Science fiction books by title, paginated
$filter=genre eq 'SCIFI'&$orderby=title&$skip=10&$top=10

// Search for "dragon" in titles, show first 3
$filter=contains(title,'dragon')&$orderby=title&$top=3
```

## Natural Language Queries

When connected to an AI agent, users can query in natural language:

| User Request | Generated OData Query |
|--------------|----------------------|
| "Show me the top 5 books with highest stock" | `$orderby=stock desc&$top=5` |
| "Find authors whose names contain 'Smith'" | `$filter=contains(name,'Smith')` |
| "Books under $20, sorted by title" | `$filter=price lt 20&$orderby=title` |
| "Get the first page of science fiction books" | `$filter=genre eq 'SCIFI'&$top=10` |

## Best Practices

### Use Projections

Always expose projections, not base entities:

```cds
// Good: Use projections
@mcp.resource: true
entity PublicBooks as projection on my.Books {
  *,
  excluding { internalNotes }
};

// Avoid: Exposing base entities directly
@mcp.resource: true
entity Books { /* base entity */ }
```

**Why**: Projections allow you to control which fields are exposed.

### Combine with CAP Authorization

Leverage CAP's `@restrict` annotations:

```cds
@mcp.resource: true
@restrict: [
  { grant: 'READ', to: 'Viewer' },
  { grant: ['READ', 'WRITE'], to: 'Admin' }
]
entity Books as projection on my.Books;
```

**Result**: MCP clients inherit CAP authorization rules.

Learn more: [CAP Authorization](https://cap.cloud.sap/docs/guides/security/authorization)

### Use @readonly for Query-Only Entities

```cds
@readonly
@mcp.resource: true
entity Books as projection on my.Books;
```

**Why**: Prevents accidental modifications through the CAP service.

### Limit Query Options for Large Datasets

```cds
// For large tables, restrict to top-N queries
@mcp: {
  name: 'logs',
  resource: ['orderby', 'top']
}
entity SystemLogs as projection on my.Logs;
```

**Why**: Prevents expensive full table scans.

## Resource vs. Entity Wrappers

Resources are different from Entity Wrappers (tools):

| Feature | Resources | Entity Wrappers |
|---------|-----------|-----------------|
| Purpose | Data browsing | Structured operations |
| Query Style | OData (natural language) | Structured parameters |
| Use Case | "Show me books by King" | "Query Books where stock > 10" |
| Tool Type | MCP Resource | MCP Tool |

Both can coexist - see [Entity Wrappers Guide](guide/entity-wrappers.md).

## Advanced: Resource Templates

The plugin automatically creates ResourceTemplates with proper OData parameter support. When you define:

```cds
@mcp: {
  name: 'books',
  resource: ['filter', 'top']
}
entity Books as projection on my.Books;
```

The plugin generates an MCP ResourceTemplate like:

```typescript
{
  uriTemplate: "books?filter={filter}&top={top}",
  name: "books",
  description: "Book data list",
  mimeType: "application/json"
}
```

AI agents use this template to construct valid resource queries.

## Related Topics

- [Entity Wrappers →](guide/entity-wrappers.md) - Expose entities as tools
- [Data Privacy →](guide/data-privacy.md) - Hide sensitive fields with `@mcp.omit`
- [Field Hints →](guide/field-hints.md) - Add descriptions with `@mcp.hint`
- [CAP OData Guide](https://cap.cloud.sap/docs/advanced/odata) - OData in CAP
