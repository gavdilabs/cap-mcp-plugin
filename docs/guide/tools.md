# Tool Annotations

Convert CAP functions and actions into executable MCP tools that AI agents can call.

## What Are Tools?

In MCP, **tools** represent executable functions that AI agents can invoke with parameters. When you annotate a CAP function or action with `@mcp.tool`, the plugin exposes it as an MCP tool that agents can discover and execute.

For more on MCP tools, see the [official MCP Tools specification](https://modelcontextprotocol.io/docs/concepts/tools).

## Service-Level Functions (Unbound Operations)

Functions defined at the service level become standalone MCP tools.

### Basic Function

```cds
service CatalogService {

  @mcp: {
    name       : 'get-author',
    description: 'Gets the desired author',
    tool       : true
  }
  function getAuthor(input: String) returns String;
}
```

**Result**: AI agents can call `get-author` tool with an `input` parameter.

### Function with Multiple Parameters

```cds
@mcp: {
  name       : 'search-books',
  description: 'Search for books by genre and availability',
  tool       : true
}
function searchBooks(
  genre: String,
  minStock: Integer,
  maxPrice: Decimal
) returns array of Books;
```

**Generated tool schema**:
```json
{
  "name": "search-books",
  "description": "Search for books by genre and availability",
  "inputSchema": {
    "type": "object",
    "properties": {
      "genre": { "type": "string" },
      "minStock": { "type": "integer" },
      "maxPrice": { "type": "number" }
    },
    "required": ["genre", "minStock", "maxPrice"]
  }
}
```

## Entity-Level Actions (Bound Operations)

Actions defined on entities become MCP tools bound to specific entity instances.

### Entity Action

```cds
entity Books as projection on my.Books;

extend projection Books with actions {
  @mcp: {
    name       : 'get-stock',
    description: 'Retrieves stock from a given book',
    tool       : true
  }
  function getStock() returns Integer;
}
```

**How it works**: The plugin binds this action to book instances based on CAP's bound action semantics.

Learn more: [CAP Actions](https://cap.cloud.sap/docs/cds/cdl#actions)

## Parameter Type Mapping

The plugin automatically converts CDS types to MCP/Zod schemas:

| CDS Type | Zod Schema | Example |
|----------|------------|---------|
| String | `z.string()` | "Science Fiction" |
| Integer | `z.number().int()` | 42 |
| Decimal | `z.number()` | 19.99 |
| Boolean | `z.boolean()` | true |
| Date | `z.string()` | "2025-01-15" |
| DateTime | `z.string()` | "2025-01-15T10:30:00Z" |
| Array | `z.array()` | ["Fiction", "SCIFI"] |

### Return Types

Functions can return simple types or complex structures:

```cds
// Simple return
function getAuthorName(id: String) returns String;

// Array return
function getRecommendations(genre: String) returns array of String;

// Complex return (entity type)
function searchBooks(query: String) returns array of Books;
```

## Tool Elicitation

Request user confirmation or input before tool execution using the `elicit` property.

### Confirmation Elicitation

Request user approval before executing:

```cds
@mcp: {
  name       : 'book-recommendation',
  description: 'Get a random book recommendation',
  tool       : true,
  elicit     : ['confirm']
}
function getBookRecommendation() returns String;
```

**User Experience**:
1. AI agent proposes calling the tool
2. User sees: "Please confirm that you want to perform action 'Get a random book recommendation'"
3. User accepts or declines
4. Tool executes only if accepted

### Input Elicitation

Prompt user to provide parameter values:

```cds
@mcp: {
  name       : 'get-author',
  description: 'Gets the desired author',
  tool       : true,
  elicit     : ['input']
}
function getAuthor(id: String) returns String;
```

**User Experience**:
1. AI agent identifies the tool as appropriate
2. User sees a form: "Please fill out the required parameters"
3. User provides `id` value
4. Tool executes with user-provided input

### Combined Elicitation

Request input, then confirmation:

```cds
@mcp: {
  name       : 'books-by-author',
  description: 'Gets a list of books made by the author',
  tool       : true,
  elicit     : ['input', 'confirm']
}
function getBooksByAuthor(authorName: String) returns array of String;
```

**Flow**:
1. User fills out parameters
2. User confirms execution
3. Tool executes

### Elicitation Types

| Type | Description | User Action |
|------|-------------|-------------|
| `confirm` | Yes/no confirmation | Accept or decline |
| `input` | Parameter form | Fill out values |
| `['input', 'confirm']` | Both in sequence | Fill, then confirm |

**Important Note**: Elicitation is only available for direct tools (functions/actions), not entity wrapper tools.

## Tool Examples

### Simple Lookup

```cds
@mcp: {
  name: 'get-book-title',
  description: 'Get the title of a book by ID',
  tool: true
}
function getBookTitle(bookId: Integer) returns String;
```

### Complex Query

```cds
@mcp: {
  name: 'advanced-search',
  description: 'Search books with multiple criteria',
  tool: true
}
function advancedSearch(
  keywords: String,
  genre: String,
  minPrice: Decimal,
  maxPrice: Decimal,
  inStockOnly: Boolean
) returns array of Books;
```

### Computation

```cds
@mcp: {
  name: 'calculate-discount',
  description: 'Calculate discounted price for a book',
  tool: true
}
function calculateDiscount(
  bookId: Integer,
  discountPercent: Decimal
) returns Decimal;
```

## Best Practices

### Use Descriptive Names

```cds
// Good: Clear, action-oriented
@mcp: { name: 'search-books-by-author', tool: true }

// Avoid: Vague or technical
@mcp: { name: 'func1', tool: true }
```

### Provide Detailed Descriptions

```cds
// Good: Explains what, why, and how
@mcp: {
  name: 'get-recommendations',
  description: 'Get personalized book recommendations based on genre and user preferences',
  tool: true
}

// Avoid: Too brief
@mcp: {
  name: 'get-recommendations',
  description: 'Get books',
  tool: true
}
```

### Use Elicitation for Sensitive Operations

```cds
// Require confirmation for operations that modify data
@mcp: {
  name: 'delete-book',
  description: 'Delete a book from the catalog',
  tool: true,
  elicit: ['input', 'confirm']
}
function deleteBook(bookId: Integer) returns Boolean;
```

### Add Parameter Hints

Combine with `@mcp.hint` for enhanced parameter descriptions:

```cds
@mcp: {
  name: 'search-books',
  description: 'Search for books',
  tool: true
}
function searchBooks(
  query: String @mcp.hint: 'Search term for book titles or authors',
  limit: Integer @mcp.hint: 'Maximum number of results (1-100)'
) returns array of Books;
```

See [Field Hints Guide](guide/field-hints.md) for more on `@mcp.hint`.

## Natural Language Tool Execution

When connected to an AI agent, users can request tool execution in natural language:

| User Request | Tool Called |
|--------------|-------------|
| "Get me a book recommendation" | `book-recommendation` |
| "Find books by Stephen King" | `search-books` with `author="Stephen King"` |
| "What's the stock for book #123?" | `get-stock` with `bookId=123` |
| "Calculate 20% off book #456" | `calculate-discount` with `bookId=456, discountPercent=20` |

## Error Handling

Tools automatically handle errors and return them in MCP format:

```javascript
// CAP service error
throw new Error('Book not found');

// Becomes MCP error response
{
  "error": {
    "code": -32000,
    "message": "Book not found"
  }
}
```

## Tool vs. Resource

Tools and Resources serve different purposes:

| Feature | Tools | Resources |
|---------|-------|-----------|
| Purpose | Execute operations | Query data |
| Invocation | Explicit function call | OData queries |
| Parameters | Structured, typed | Query parameters |
| Use Case | "Calculate discount" | "Show me books" |

Both can be used together in your service.

## Related Topics

- [Entity Wrappers →](guide/entity-wrappers.md) - Auto-generated CRUD tools
- [Field Hints →](guide/field-hints.md) - Enhance parameter descriptions
- [Prompts →](guide/prompts.md) - Reusable prompt templates
- [CAP Actions Reference](https://cap.cloud.sap/docs/cds/cdl#actions) - CAP actions documentation
