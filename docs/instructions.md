# MCP Server Instructions

The CAP MCP plugin allows you to provide detailed instructions to AI agents about how to effectively use your MCP server. These instructions are included in the server's metadata and help AI agents understand your service's capabilities, data model, and best practices.

## Why Use Instructions?

AI agents work best when they have context about:

- **Service Purpose**: What your service does and what problems it solves
- **Data Model**: Understanding of your entities, relationships, and business logic
- **Usage Patterns**: Common workflows and recommended approaches
- **Constraints**: Business rules, validation requirements, and limitations
- **Examples**: Sample queries and typical use cases

Well-crafted instructions can significantly improve how AI agents interact with your service, leading to more accurate queries and better user experiences.

## Configuration Options

### String-Based Instructions (Inline)

For simple instructions, you can provide them directly in your configuration:

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

The file path can be:
- **Project root**: `./mcp-instructions.md`, `./service-guide.md`
- **Config directory**: `./config/mcp-instructions.md`
- **Absolute paths**: `/path/to/instructions.md`
- **Must be Markdown**: Only `.md` files are supported for consistency and AI agent compatibility

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
When users ask about books, always include author information:
```

### Include Context About Business Logic

Help AI agents understand your business rules:

```markdown
## Business Rules

- Books with stock = 0 are out of stock but still browseable
- Prices are in EUR by default
- Author searches are case-insensitive
- Genre filtering supports multiple genres (OR logic)

## Query Guidelines

- Always use `$expand=author` when fetching books
- Use `$filter=stock gt 0` to show only available books
- For text searches, use `contains()` function for partial matches
```

### Provide Examples

Include concrete examples of effective queries:

```markdown
## Example Queries

### Find author of a given book

Utilize the author_ID property provided when you search up a book on the server to then make a targeted 'get' tool request for the given author.
If the user only asked for the name, remember to only perform a selection for that specific property in your query.

```

### Best Practices

1. **Be Specific**: Include field names, entity relationships, and data types
2. **Include Constraints**: Mention validation rules, required fields, and business logic
3. **Provide Context**: Explain why certain approaches are preferred
4. **Use Examples**: Show both good and bad query patterns
5. **Keep Updated**: Instructions should evolve with your service
6. **Test with AI**: Validate that AI agents understand your instructions

## File Management

### Version Control
Store instruction files in your repository alongside your configuration:

```
├── srv/
├── db/
├── config/
│   ├── mcp-instructions.md
│   └── environment-config.json
├── mcp-instructions.md          # Alternative: project root
└── package.json
```

### Build Integration
The plugin automatically includes instruction files in your deployment. No additional build steps are required.

### Multiple Environments
You can use different instruction files per environment:

```json
{
  "cds": {
    "mcp": {
      "instructions": {
        "file": "./config/instructions-${NODE_ENV}.md"
      }
    }
  }
}
```

## Error Handling

The plugin validates instruction files at startup:

- **File not found**: Clear error message with suggested paths
- **Invalid format**: Only `.md` files are accepted
- **Encoding issues**: Files must be UTF-8 encoded

If instruction loading fails, the MCP server will start without instructions and log appropriate warnings.

## Example Instruction File

Here's a complete example for a bookshop service:

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
- **ID**: Unique book identifier
- **title**: Book title (searchable)
- **author_ID**: Links to Authors entity
- **genre_code**: Genre classification
- **price**: Price in EUR
- **stock**: Available quantity (0 = out of stock)

### Authors Entity
- **ID**: Unique author identifier
- **name**: Full author name (searchable)
- **dateOfBirth**: Author's birth date
- **country**: Country of origin

## Query Guidelines

1. **Always expand author details**: Use `$expand=author` when fetching books
2. **Filter available books**: Use `$filter=stock gt 0` for in-stock items
3. **Text searches**: Use `contains()` for partial title/author matching
4. **Sorting**: Default sort by title, use `$orderby=price` for price sorting

## Common Patterns

### Find books by author
```
Books?$filter=contains(author/name,'Tolkien')&$expand=author
```

### Browse by genre with availability
```
Books?$filter=genre_code eq 'SCIFI' and stock gt 0&$expand=author&$orderby=title
```

### Search across titles and authors
```
Books?$filter=contains(title,'dragon') or contains(author/name,'dragon')&$expand=author
```

## Business Rules

- Out of stock books (stock = 0) remain in catalog
- Prices include VAT
- Author searches are case-insensitive
- Genre codes: FICTION, SCIFI, MYSTERY, ROMANCE, etc.
```

This comprehensive instruction file helps AI agents understand not just what data is available, but how to query it effectively for common user needs.
