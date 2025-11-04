# Prompt Templates

Define reusable AI prompt templates with parameterization and variable substitution.

## What Are Prompts?

In MCP, **prompts** are reusable templates for AI interactions. They provide pre-defined conversation starters, instructions, or queries that AI agents can use directly or customize with parameters.

For more on MCP prompts, see the [official MCP Prompts specification](https://modelcontextprotocol.io/docs/concepts/prompts).

## Basic Prompt Template

Prompts are defined at the service level using the `@mcp.prompts` annotation:

```cds
service CatalogService {
  // ... entities and functions ...
}

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

**Result**: AI agents can use this prompt template and substitute `{{book-id}}` with actual values.

## Prompt Structure

Each prompt definition includes:

| Property | Required | Type | Description |
|----------|----------|------|-------------|
| `name` | Yes | String | Unique identifier for the prompt |
| `title` | No | String | Human-readable title |
| `description` | No | String | Explains what the prompt does |
| `template` | Yes | String | Prompt text with `{{variable}}` placeholders |
| `role` | No | String | Either `"user"` or `"assistant"` (default: `"user"`) |
| `inputs` | No | Array | Parameter definitions for variables |

### Template Variables

Use `{{variable}}` syntax for parameter substitution:

```cds
template: 'Summarize the book titled {{title}} written by {{author}}'
```

Variables are replaced at runtime with actual values.

### Input Definitions

Define parameters that the prompt expects:

```cds
inputs: [
  {
    key : 'title',
    type: 'String'
  },
  {
    key : 'author',
    type: 'String'
  }
]
```

**Supported types**: `String`, `Integer`, `Decimal`, `Boolean`, `Date`, `DateTime`

## Prompt Examples

### Simple Static Prompt

No parameters, just a fixed instruction:

```cds
annotate CatalogService with @mcp.prompts: [{
  name       : 'book-catalog-intro',
  title      : 'Introduction to Book Catalog',
  description: 'Introduces the user to available books',
  template   : 'Welcome to the book catalog! I can help you find books, check availability, and get recommendations.',
  role       : 'assistant'
}];
```

### Search Prompt

Parameterized search instruction:

```cds
annotate CatalogService with @mcp.prompts: [{
  name       : 'search-books',
  title      : 'Search Books',
  description: 'Search for books by keywords',
  template   : 'Search the book catalog for books related to {{keywords}} and show me the top {{limit}} results',
  role       : 'user',
  inputs     : [
    { key: 'keywords', type: 'String' },
    { key: 'limit', type: 'Integer' }
  ]
}];
```

### Analysis Prompt

Request AI analysis of data:

```cds
annotate CatalogService with @mcp.prompts: [{
  name       : 'analyze-genre-trends',
  title      : 'Genre Trends Analysis',
  description: 'Analyze trends in book genres',
  template   : 'Analyze the sales trends for {{genre}} books in the last {{months}} months and provide insights',
  role       : 'user',
  inputs     : [
    { key: 'genre', type: 'String' },
    { key: 'months', type: 'Integer' }
  ]
}];
```

### Recommendation Prompt

Guide AI to provide recommendations:

```cds
annotate CatalogService with @mcp.prompts: [{
  name       : 'personalized-recommendation',
  title      : 'Get Book Recommendations',
  description: 'Get personalized book recommendations',
  template   : 'Based on my interest in {{genre}} and preference for {{style}} writing, recommend {{count}} books from the catalog',
  role       : 'user',
  inputs     : [
    { key: 'genre', type: 'String' },
    { key: 'style', type: 'String' },
    { key: 'count', type: 'Integer' }
  ]
}];
```

## Multiple Prompts

You can define multiple prompts for a single service:

```cds
annotate CatalogService with @mcp.prompts: [
  {
    name       : 'book-summary',
    title      : 'Book Summary',
    description: 'Get a summary of a book',
    template   : 'Provide a detailed summary of the book {{title}}',
    role       : 'user',
    inputs     : [{ key: 'title', type: 'String' }]
  },
  {
    name       : 'author-bio',
    title      : 'Author Biography',
    description: 'Get author biography',
    template   : 'Tell me about the author {{author-name}} and their notable works',
    role       : 'user',
    inputs     : [{ key: 'author-name', type: 'String' }]
  },
  {
    name       : 'genre-info',
    title      : 'Genre Information',
    description: 'Get information about a book genre',
    template   : 'Explain the {{genre}} genre and its characteristics',
    role       : 'user',
    inputs     : [{ key: 'genre', type: 'String' }]
  }
];
```

## Prompt Roles

Prompts can use different roles to guide conversation:

### User Role

Questions or requests from the user's perspective:

```cds
{
  template: 'Find me books about {{topic}}',
  role: 'user'
}
```

### Assistant Role

Responses or actions from the AI's perspective:

```cds
{
  template: 'I will search for books about {{topic}} and provide recommendations',
  role: 'assistant'
}
```

**Note**: Most prompts use `role: 'user'` to represent user requests.

## How AI Agents Use Prompts

When connected to an MCP client:

1. **Discovery**: Client lists available prompts with `prompts/list`
2. **Selection**: User or AI selects appropriate prompt
3. **Parameterization**: User provides values for `{{variables}}`
4. **Execution**: Prompt template is filled and sent to AI
5. **Response**: AI processes the complete prompt

### Example Flow

**User**: "I want to search for science fiction books"

**AI Agent**:
1. Identifies `search-books` prompt as appropriate
2. Extracts parameters: `keywords="science fiction"`, `limit=10`
3. Fills template: "Search the book catalog for books related to science fiction and show me the top 10 results"
4. Executes search using catalog resources/tools

## Best Practices

### Use Clear Variable Names

```cds
// Good: Descriptive variable names
template: 'Search for {{book-title}} by {{author-name}}'

// Avoid: Generic or cryptic names
template: 'Search for {{x}} by {{y}}'
```

### Provide Context in Templates

```cds
// Good: Includes context and instructions
template: 'Using the book catalog, find all books in the {{genre}} genre published after {{year}} and rank them by popularity'

// Avoid: Too vague
template: 'Find books {{genre}} {{year}}'
```

### Match Input Types to Usage

```cds
// Good: Correct types
inputs: [
  { key: 'title', type: 'String' },
  { key: 'count', type: 'Integer' }
]

// Avoid: Everything as String
inputs: [
  { key: 'title', type: 'String' },
  { key: 'count', type: 'String' }  // Should be Integer
]
```

### Use Prompts for Common Workflows

Create prompts for frequently requested operations:

```cds
annotate CatalogService with @mcp.prompts: [
  {
    name: 'check-availability',
    description: 'Check if a book is in stock',
    template: 'Check if the book {{title}} is currently available in stock',
    inputs: [{ key: 'title', type: 'String' }]
  },
  {
    name: 'compare-books',
    description: 'Compare two books',
    template: 'Compare {{book1}} and {{book2}} in terms of genre, price, and availability',
    inputs: [
      { key: 'book1', type: 'String' },
      { key: 'book2', type: 'String' }
    ]
  }
];
```

## Prompts vs. Tools

Prompts and Tools serve different purposes:

| Feature | Prompts | Tools |
|---------|---------|-------|
| Purpose | Guide AI conversation | Execute operations |
| Structure | Natural language templates | Structured function calls |
| Parameters | Template variables | Typed function parameters |
| Execution | AI processes text | CAP function executes |
| Output | AI-generated response | Structured data/results |

**Use prompts** when you want to guide how AI interacts with your data.

**Use tools** when you need to execute specific CAP functions.

## Testing Prompts

Use the MCP Inspector to test your prompts:

```bash
npm run inspect
```

1. Connect to your MCP server
2. List prompts
3. Select a prompt
4. Fill in parameter values
5. View the generated prompt text

## Related Topics

- [Resources →](guide/resources.md) - Query entities with OData
- [Tools →](guide/tools.md) - Execute CAP functions
- [MCP Instructions →](guide/mcp-instructions.md) - Server-wide guidance
- [MCP Prompts Specification](https://modelcontextprotocol.io/docs/concepts/prompts) - Official MCP docs
