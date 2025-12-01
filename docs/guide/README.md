# User Guide

Complete guide to using the CAP MCP Plugin, from annotations to configuration.

## Annotation Types

The plugin supports several annotation types to expose your CAP services to AI agents:

### 📊 [Resources](guide/resources.md)
Expose CAP entities as queryable MCP resources with OData v4 support.

```cds
@mcp: {
  name: 'books',
  description: 'Book catalog data',
  resource: ['filter', 'orderby', 'top']
}
entity Books as projection on my.Books;
```

### 🔧 [Tools](guide/tools.md)
Convert CAP functions and actions into executable MCP tools.

```cds
@mcp: {
  name: 'get-recommendations',
  description: 'Get book recommendations',
  tool: true
}
function getRecommendations(genre: String) returns array of String;
```

### 💡 [Prompts](guide/prompts.md)
Define reusable prompt templates with variable substitution.

```cds
annotate CatalogService with @mcp.prompts: [{
  name: 'summarize-book',
  description: 'Generate book summary',
  template: 'Summarize: {{title}}'
}];
```

### 🎯 [Entity Wrappers](guide/entity-wrappers.md)
Automatically expose entities as tools for query/get/create/update/delete operations.

## Configuration & Setup

- [Configuration](guide/configuration.md) - Plugin configuration options
- [Authentication](guide/authentication.md) - Authentication modes
- [MCP Instructions](guide/mcp-instructions.md) - Writing server instructions
- [Field Hints](guide/field-hints.md) - Using `@mcp.hint` annotations
- [Data Privacy](guide/data-privacy.md) - Protecting sensitive data with `@mcp.omit`

## Quick Reference

| Feature | Annotation | Purpose |
|---------|------------|---------|
| Resources | `@mcp.resource` | Expose entities for querying |
| Tools | `@mcp.tool` | Expose functions/actions |
| Prompts | `@mcp.prompts` | Define prompt templates |
| Entity Wrappers | `@mcp.wrap` | Auto-generate entity tools |
| Field Hints | `@mcp.hint` | Add field descriptions |
| Data Privacy | `@mcp.omit` | Hide sensitive fields |
