# MCP Server Instructions

Provide detailed guidance to AI agents about how to effectively use your MCP server through server-level instructions.

## Why Use Instructions?

Server instructions are metadata included with your MCP server that help AI agents understand:

- **Service Purpose**: What your service does and what problems it solves
- **Data Model**: Understanding of your entities, relationships, and business logic
- **Usage Patterns**: Common workflows and recommended approaches
- **Constraints**: Business rules, validation requirements, and limitations
- **Examples**: Sample queries and typical use cases

Well-crafted instructions can significantly improve how AI agents interact with your service, leading to more accurate queries and better user experiences.

## Configuration Methods

### Inline Instructions (String)

For simple instructions, provide them directly in `package.json`:

```json
{
  "cds": {
    "mcp": {
      "name": "bookshop-service",
      "version": "1.0.0",
      "instructions": "This service manages a bookshop catalog with books, authors, and genres. Use the Books entity to search for books by title, author, or genre. Always include author details when fetching book information."
    }
  }
}
```

**Use when**: Instructions are brief (1-2 sentences).

### File-Based Instructions (Recommended)

For comprehensive instructions, use a separate Markdown file:

```json
{
  "cds": {
    "mcp": {
      "name": "bookshop-service",
      "version": "1.0.0",
      "instructions": {
        "file": "./mcp-instructions.md"
      }
    }
  }
}
```

**File path options**:
- **Project root**: `./mcp-instructions.md`, `./service-guide.md`
- **Config directory**: `./config/mcp-instructions.md`
- **Absolute paths**: `/path/to/instructions.md`

**Requirements**: Must be a `.md` (Markdown) file for consistency and AI agent compatibility.

## Writing Effective Instructions

### Structure Your Instructions

Use clear Markdown structure to organize information:

```markdown
# Service Overview

Brief description of what your service does and its primary use cases.

## Data Model

### Books
- **title**: Book title (required for searches)
- **author_ID**: Foreign key to Authors entity
- **price**: Decimal, includes currency considerations
- **stock**: Integer, 0 means out of stock

### Authors
- **name**: Full author name
- **country**: Author's country (useful for regional queries)

## Common Use Cases

### Finding Books
When users ask about books, always include author information using the author_ID.
```

### Include Business Logic Context

Help AI agents understand your business rules:

```markdown
## Business Rules

- Books with stock = 0 are out of stock but still browseable
- Prices are in EUR by default
- Author searches are case-insensitive
- Genre filtering supports multiple genres (OR logic)

## Query Guidelines

- Always use author_ID to fetch author details in a separate call
- Use `where: "stock > 0"` to show only available books
- For text searches, use the `q` parameter for simple contains matching
```

### Provide Concrete Examples

Include specific examples of effective operations:

```markdown
## Example Queries

### Find author of a given book

Utilize the author_ID property provided when you search up a book on the server
to then make a targeted 'get' tool request for the given author.
If the user only asked for the name, remember to only perform a selection for
that specific property in your query.

**Steps**:
1. Query books: `CatalogService_Books_query({ where: "title LIKE '%Foundation%'" })`
2. Extract `author_ID` from result
3. Get author: `CatalogService_Authors_get({ ID: author_ID })`

### Search across multiple fields

Use the `q` parameter for simple text search:
```
CatalogService_Books_query({ q: "dragon", top: 10 })
```

This searches across all string fields (title, description, etc.)
```

### Document Tool Usage

Explain when to use different tools:

```markdown
## Tool Selection Guide

### Query vs. Get
- **Use `_query` tools**: When searching, filtering, or listing multiple records
  - Example: "Find all science fiction books"
  - Example: "Show books with stock > 20"

- **Use `_get` tools**: When fetching a single record by ID
  - Example: "Get book with ID 123"
  - Example: "Show details for author #42"

### Resource vs. Entity Wrapper
- **Use Resources**: For natural language queries and browsing
  - More flexible, OData-based
  - Example: "Books about dragons"

- **Use Entity Wrappers**: For structured, precise operations
  - Validated parameters
  - Example: `CatalogService_Books_query({ where: "stock > 10", top: 5 })`
```

## Best Practices

### 1. Be Specific

Include field names, entity relationships, and data types:

```markdown
## Books Entity Structure

- **ID** (Integer): Unique book identifier
- **title** (String): Book title, fully searchable
- **author_ID** (Integer): Foreign key to Authors.ID - always use this to fetch author details
- **stock** (Integer): Current inventory, 0 means out of stock
- **price** (Decimal): Price in EUR, includes VAT
```

### 2. Include Constraints

Mention validation rules and business logic:

```markdown
## Validation Rules

- Book titles must be unique
- Stock cannot be negative
- Prices must be greater than 0
- Author ID must reference existing author
```

### 3. Provide Context

Explain why certain approaches are preferred:

```markdown
## Performance Tips

**Why separate author calls?**
Books and Authors are separate entities. While you could expand associations,
it's more efficient to:
1. Query books first
2. Extract unique author IDs
3. Fetch author details in batch

This reduces data transfer and improves response time.
```

### 4. Use Examples Generously

Show both good and bad patterns:

```markdown
## Example Patterns

### ✅ Good: Targeted query with filters
```
CatalogService_Books_query({
  select: ['ID', 'title', 'stock'],
  where: 'stock > 0',
  orderby: 'title',
  top: 20
})
```

### ❌ Avoid: Fetching all records without filters
```
CatalogService_Books_query({})  // May return thousands of records
```
```

### 5. Keep Updated

Instructions should evolve with your service:

```markdown
## Changelog

### v1.2.0 - January 2025
- Added `discount` field to Books
- New tool: `calculate-discount`

### v1.1.0 - December 2024
- Enhanced genre filtering
- Added `recommendedAge` field
```

## File Management

### Version Control

Store instruction files in your repository:

```
project-root/
├── srv/
├── db/
├── config/
│   └── mcp-instructions.md
├── mcp-instructions.md          # Alternative: project root
└── package.json
```

**Benefits**:
- Track changes over time
- Review updates in PRs
- Keep instructions in sync with code

### Build Integration

The plugin automatically loads instruction files at startup. No additional build steps required.

### Multiple Environments

Use different instruction files per environment:

```json
{
  "cds": {
    "mcp": {
      "instructions": {
        "[development]": {
            "file": "./config/instructions-development.md"
        },
        "[production]": {
            "file": "./config/instructions-production.md"
        }
      }
    }
  }
}
```

**Example files**:
- `instructions-development.md` - Includes test data notes
- `instructions-production.md` - Production-specific guidance

## Error Handling

The plugin validates instruction files at startup:

| Error | Message | Resolution |
|-------|---------|------------|
| File not found | `MCP instructions file not found: ./mcp-instructions.md` | Check file path, verify file exists |
| Invalid format | `Only .md files are supported for MCP instructions` | Rename to `.md` extension |
| Encoding issues | `Failed to read instructions file` | Ensure UTF-8 encoding |

**Startup behavior**: If instruction loading fails, the MCP server starts without instructions and logs warnings.

## Complete Example

Here's a comprehensive instruction file for a bookshop service:

```markdown
# Bookshop MCP Service

This service provides access to a bookshop's catalog data including books, authors, and inventory information.

## Service Purpose

- Browse and search book catalog
- Check book availability and pricing
- Find books by author, genre, or keywords
- Access detailed author information

## Data Model

### Books Entity
- **ID** (Integer): Unique book identifier
- **title** (String): Book title, searchable
- **author_ID** (Integer): Foreign key to Authors entity - use this to fetch author details
- **genre_code** (String): Genre classification (FICTION, SCIFI, MYSTERY, etc.)
- **price** (Decimal): Price in EUR including VAT
- **stock** (Integer): Available quantity, 0 = out of stock

### Authors Entity
- **ID** (Integer): Unique author identifier
- **name** (String): Full author name, searchable
- **dateOfBirth** (Date): Author's birth date
- **country** (String): Country of origin

## Query Guidelines

1. **Fetch author details separately**: Use author_ID from Books to call Authors get/query
2. **Filter available books**: Use `where: "stock > 0"` for in-stock items only
3. **Text searches**: Use `q` parameter for simple contains matching across string fields
4. **Sorting**: Default sort by title, use `orderby: "price DESC"` for price sorting

## Tool Selection

### Query Tools
Use `Service_Entity_query` for:
- Searching/filtering: "Find books with stock > 10"
- Listing: "Show all authors from USA"
- Aggregations: "Count books by genre"

### Get Tools
Use `Service_Entity_get` for:
- Single record by ID: "Get book #123"
- Known key lookup: "Show author with ID 42"

## Common Patterns

### Find books by author name
**Step 1**: Query authors
```
CatalogService_Authors_query({ where: "name LIKE '%Tolkien%'" })
```

**Step 2**: Extract author ID(s)

**Step 3**: Query books
```
CatalogService_Books_query({ where: "author_ID = 42" })
```

### Browse by genre with availability
```
CatalogService_Books_query({
  where: "genre_code = 'SCIFI' AND stock > 0",
  orderby: "title",
  top: 20
})
```

### Get full book details including author
**Step 1**: Get book
```
CatalogService_Books_get({ ID: 123 })
```

**Step 2**: Extract author_ID, then get author
```
CatalogService_Authors_get({ ID: author_ID })
```

## Business Rules

- Out of stock books (stock = 0) remain in catalog but aren't available for purchase
- Prices include VAT
- Author searches are case-insensitive
- Genre codes: FICTION, SCIFI, MYSTERY, ROMANCE, BIOGRAPHY, HISTORY
- Book titles must be unique within the catalog

## Performance Tips

- Use `select` to retrieve only needed fields
- Apply `where` filters to reduce result sets
- Use `top` to limit large queries
- Batch author lookups when displaying book lists
```

## Testing Instructions

Use the MCP Inspector to verify your instructions are loaded:

```bash
npm run inspect
```

1. Connect to your MCP server
2. Check server info - instructions should appear in metadata
3. Test that AI agent can access and use the instructions

## Related Topics

- [Configuration →](guide/configuration.md) - MCP server configuration
- [Resources →](guide/resources.md) - Expose entities as resources
- [Tools →](guide/tools.md) - Create executable tools
- [Entity Wrappers →](guide/entity-wrappers.md) - CRUD tool generation
