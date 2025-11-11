# Simple Bookshop Example

A basic example demonstrating resources and tools with the CAP MCP Plugin.

## Overview

This example shows:
- **Resources**: Exposing entities for AI queries
- **Tools**: Creating executable functions
- **OData Queries**: Filtering, sorting, and pagination
- **Basic Configuration**: Minimal setup

**Difficulty**: Beginner (5-10 minutes)

## What You'll Build

A simple bookshop MCP server that allows AI agents to:
- Browse books with filtering and sorting
- Search for authors
- Get book recommendations
- Check book availability

## Prerequisites

- Node.js 18+
- Basic understanding of CAP
- Familiarity with CDS syntax

## Project Structure

```
bookshop-basic/
├── package.json
├── db/
│   └── schema.cds
└── srv/
    └── catalog-service.cds
```

## Step 1: Data Model

Create `db/schema.cds`:

```cds
namespace my.bookshop;

entity Books {
  key ID     : Integer;
      title  : String(100);
      author : Association to Authors;
      stock  : Integer;
      price  : Decimal(10, 2);
      genre  : String(50);
}

entity Authors {
  key ID      : Integer;
      name    : String(100);
      country : String(50);
      books   : Association to many Books on books.author = $self;
}
```

## Step 2: Service Definition

Create `srv/catalog-service.cds`:

```cds
using my.bookshop from '../db/schema';

service CatalogService {

  // Resource: Browse books with OData queries
  @readonly
  @mcp: {
    name       : 'books',
    description: 'Book catalog with search and filtering',
    resource   : ['filter', 'orderby', 'select', 'top', 'skip']
  }
  entity Books as projection on bookshop.Books;

  // Resource: Search authors
  @readonly
  @mcp: {
    name       : 'authors',
    description: 'Author directory',
    resource   : ['filter', 'orderby', 'top']
  }
  entity Authors as projection on bookshop.Authors;

  // Tool: Get recommendations
  @mcp: {
    name       : 'get-recommendations',
    description: 'Get book recommendations by genre',
    tool       : true
  }
  function getRecommendations(
    genre : String,
    limit : Integer
  ) returns array of String;

  // Tool: Check availability
  @mcp: {
    name       : 'check-availability',
    description: 'Check if a book is in stock',
    tool       : true
  }
  function checkAvailability(
    bookId : Integer
  ) returns Boolean;
}
```

## Step 3: Implement Functions

Create `srv/catalog-service.js`:

```javascript
const cds = require('@sap/cds');

module.exports = cds.service.impl(async function() {

  this.on('getRecommendations', async (req) => {
    const { genre, limit } = req.data;

    // Query books by genre
    const books = await SELECT.from('my.bookshop.Books')
      .where({ genre: genre, stock: { '>': 0 } })
      .limit(limit || 5);

    // Return titles
    return books.map(b => b.title);
  });

  this.on('checkAvailability', async (req) => {
    const { bookId } = req.data;

    // Get book stock
    const book = await SELECT.one.from('my.bookshop.Books')
      .where({ ID: bookId });

    // Return availability
    return book && book.stock > 0;
  });
});
```

## Step 4: Configuration

Create `package.json`:

```json
{
  "name": "bookshop-basic",
  "version": "1.0.0",
  "description": "Simple bookshop MCP server",
  "dependencies": {
    "@sap/cds": "^8.0.0",
    "@gavdi/cap-mcp": "^1.3.0"
  },
  "scripts": {
    "start": "cds serve"
  },
  "cds": {
    "mcp": {
      "name": "bookshop-mcp",
      "version": "1.0.0",
      "auth": "none",
      "instructions": "Simple bookshop catalog. Use 'books' to browse, 'authors' to search authors, tools for recommendations."
    },
    "requires": {
      "db": {
        "kind": "sqlite",
        "credentials": {
          "database": ":memory:"
        }
      }
    }
  }
}
```

## Step 5: Sample Data

Create `db/data/my.bookshop-Books.csv`:

```csv
ID,title,author_ID,stock,price,genre
1,"Foundation","1",42,15.99,"Science Fiction"
2,"1984","2",23,12.99,"Dystopian"
3,"To Kill a Mockingbird","3",31,14.99,"Classic"
4,"The Hobbit","4",18,16.99,"Fantasy"
5,"Dune","5",27,18.99,"Science Fiction"
```

Create `db/data/my.bookshop-Authors.csv`:

```csv
ID,name,country
1,"Isaac Asimov","USA"
2,"George Orwell","UK"
3,"Harper Lee","USA"
4,"J.R.R. Tolkien","UK"
5,"Frank Herbert","USA"
```

## Step 6: Run the Application

```bash
# Install dependencies
npm install

# Start the server
npm start
```

**Expected output**:
```
[cds] - loaded model from 2 file(s)
[cds] - connect to db > sqlite { database: ':memory:' }
[cds] - serving CatalogService at /catalog
[cds] - serving MCP at /mcp
[cds] - server listening on { url: 'http://localhost:4004' }
```

## Step 7: Test with MCP Inspector

```bash
# In another terminal
npx @modelcontextprotocol/inspector
```

1. Enter URL: `http://localhost:4004/mcp`
2. Click "Connect"
3. Explore the MCP server

### Test Resources

**List Resources**:
```json
{
  "method": "resources/list"
}
```

**Response**:
```json
{
  "resources": [
    {
      "uri": "books",
      "name": "books",
      "description": "Book catalog with search and filtering",
      "mimeType": "application/json"
    },
    {
      "uri": "authors",
      "name": "authors",
      "description": "Author directory",
      "mimeType": "application/json"
    }
  ]
}
```

**Query Books**:
```json
{
  "method": "resources/read",
  "params": {
    "uri": "books?$filter=stock gt 20&$orderby=title&$top=3"
  }
}
```

**Response**:
```json
{
  "contents": [{
    "uri": "books",
    "mimeType": "application/json",
    "text": "[{\"ID\":1,\"title\":\"Foundation\",\"stock\":42,\"price\":15.99,\"genre\":\"Science Fiction\"},...}]"
  }]
}
```

### Test Tools

**List Tools**:
```json
{
  "method": "tools/list"
}
```

**Response**:
```json
{
  "tools": [
    {
      "name": "get-recommendations",
      "description": "Get book recommendations by genre",
      "inputSchema": {
        "type": "object",
        "properties": {
          "genre": { "type": "string" },
          "limit": { "type": "integer" }
        }
      }
    },
    {
      "name": "check-availability",
      "description": "Check if a book is in stock",
      "inputSchema": {
        "type": "object",
        "properties": {
          "bookId": { "type": "integer" }
        }
      }
    }
  ]
}
```

**Call Tool**:
```json
{
  "method": "tools/call",
  "params": {
    "name": "get-recommendations",
    "arguments": {
      "genre": "Science Fiction",
      "limit": 3
    }
  }
}
```

**Response**:
```json
{
  "content": [{
    "type": "text",
    "text": "[\"Foundation\",\"Dune\"]"
  }]
}
```

## Natural Language Examples

When connected to an AI agent (like Claude Desktop):

**User**: "Show me science fiction books"
**AI**: Queries `books?$filter=genre eq 'Science Fiction'`
**Result**: Foundation, Dune

**User**: "Are there any books by Tolkien in stock?"
**AI**: Queries `books?$filter=contains(author,'Tolkien') and stock gt 0`
**Result**: The Hobbit (18 in stock)

**User**: "Recommend some fantasy books"
**AI**: Calls tool `get-recommendations` with `genre: "Fantasy", limit: 3`
**Result**: The Hobbit

**User**: "Is book #1 available?"
**AI**: Calls tool `check-availability` with `bookId: 1`
**Result**: true

## Understanding the Annotations

### Resource Annotation

```cds
@mcp: {
  name       : 'books',           // Resource identifier
  description: 'Book catalog...', // Shown to AI
  resource   : ['filter', 'orderby', 'select', 'top', 'skip']
}
```

**Enables OData queries**:
- `$filter` - Filter by field values
- `$orderby` - Sort results
- `$select` - Choose specific fields
- `$top` - Limit results
- `$skip` - Pagination offset

### Tool Annotation

```cds
@mcp: {
  name       : 'get-recommendations',
  description: 'Get book recommendations by genre',
  tool       : true  // Mark as executable tool
}
function getRecommendations(genre: String, limit: Integer) returns array of String;
```

**Creates executable tool**:
- Parameters become tool schema
- Return type defines response format
- Function implementation handles logic

## Extending the Example

### Add Entity Wrappers

Enable CRUD operations:

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

**Result**: Tools like `CatalogService_Books_query`, `CatalogService_Books_get`

### Add Prompt Templates

```cds
annotate CatalogService with @mcp.prompts: [{
  name: 'summarize-book',
  description: 'Get book summary',
  template: 'Provide a summary of the book "{{title}}"',
  inputs: [{ key: 'title', type: 'String' }]
}];
```

### Add Field Hints

```cds
entity Books {
  key ID    : Integer @mcp.hint: 'Unique book identifier';
      title : String @mcp.hint: 'Full book title';
      stock : Integer @mcp.hint: 'Available quantity, 0 means out of stock';
}
```

### Add Data Privacy

```cds
entity Books {
  key ID            : Integer;
      title         : String;
      internalNotes : String @mcp.omit;  // Hidden from MCP
}
```

## Troubleshooting

### Books not appearing in resources

Check annotation syntax:
```bash
cds compile srv/ --to csn | grep "@mcp"
```

### Tools not executing

Check function implementation:
```bash
# Add logging
console.log('getRecommendations called with:', req.data);
```

### OData queries failing

Test directly with CAP:
```bash
curl http://localhost:4004/catalog/Books?$filter=stock%20gt%2020
```

## Related Topics

- [Resources Guide →](../guide/resources.md) - Resource annotations
- [Tools Guide →](../guide/tools.md) - Tool annotations
- [Configuration →](../guide/configuration.md) - Plugin configuration
- [Testing →](../getting-started/testing.md) - Testing methods
