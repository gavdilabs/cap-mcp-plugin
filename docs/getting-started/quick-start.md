# Quick Start

Get your first MCP-enabled CAP service running in 5 minutes!

## Step 1: Install the Plugin

If you haven't already installed the plugin:

```bash
npm install @gavdi/cap-mcp
```

The plugin follows CAP's standard plugin architecture and will automatically integrate with your CAP application.

## Step 2: Add Configuration (Optional)

Add MCP configuration to your `package.json`:

```json
{
  "cds": {
    "mcp": {
      "name": "my-bookshop-mcp",
      "auth": "inherit"
    }
  }
}
```

This step is optional - the plugin works with default settings.

## Step 3: Add MCP Annotations

Annotate your CAP service entities and functions with `@mcp` annotations:

```cds
// srv/catalog-service.cds
service CatalogService {

  @mcp: {
    name: 'books',
    description: 'Book catalog with search and filtering',
    resource: ['filter', 'orderby', 'select', 'top', 'skip']
  }
  entity Books as projection on my.Books;

  @mcp: {
    name: 'get-recommendations',
    description: 'Get personalized book recommendations',
    tool: true
  }
  function getRecommendations(genre: String, limit: Integer) returns array of String;
}
```

## Step 4: Start Your Server

Start your CAP application:

```bash
cds serve
```

You should see output indicating the MCP endpoints are available:

```
[cds] - server listening on http://localhost:4004
[mcp] - MCP server available at /mcp
[mcp] - Health check available at /mcp/health
```

## Step 5: Test Your MCP Server

### Option 1: Health Check

Verify the server is running:

```bash
curl http://localhost:4004/mcp/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-03T..."
}
```

### Option 2: MCP Inspector

Test your implementation interactively:

```bash
npx @modelcontextprotocol/inspector
```

Then connect to `http://localhost:4004/mcp` in the inspector.

### Option 3: Use with Claude Desktop

Configure Claude Desktop to connect to your MCP server. See the [MCP documentation](https://modelcontextprotocol.io/docs/tools/inspector) for details.

## What You Get

With the annotations above, you now have:

### 📊 A Resource
- **Name**: `books`
- **Capabilities**: Filter, order, select, pagination
- **Query Example**: "Find books with stock > 10, sorted by title"

### 🔧 A Tool
- **Name**: `get-recommendations`
- **Parameters**: `genre` (String), `limit` (Integer)
- **Invocation**: AI agents can call this function directly

## Example Interaction

Once configured, AI agents can interact with your service:

**User**: "Show me science fiction books with more than 5 in stock"

**AI Agent**:
1. Queries the `books` resource
2. Applies filters: `genre eq 'SCIFI' and stock gt 5`
3. Returns formatted results to the user

## Next Steps

### Explore More Features

- **[Entity Wrappers](guide/entity-wrappers.md)** - Auto-generate CRUD tools
- **[Prompts](guide/prompts.md)** - Create reusable prompt templates
- **[Field Hints](guide/field-hints.md)** - Add descriptions with `@mcp.hint`
- **[Data Privacy](guide/data-privacy.md)** - Hide sensitive fields with `@mcp.omit`

### Learn the Concepts

- **[Architecture](core-concepts/architecture.md)** - How the plugin works
- **[Data Flow](core-concepts/data-flow.md)** - Request/response flow

### See Examples

- **[Bookshop Basic](examples/bookshop-basic.md)** - Complete walkthrough
- **[Workflow Approvals](examples/workflow-approvals.md)** - Real-world use case

### Configure & Deploy

- **[Configuration](guide/configuration.md)** - All configuration options
- **[Authentication](guide/authentication.md)** - Security setup

## Video Tutorial

Watch the complete SAP Devtoberfest tutorial:

<div class="video-container">
  <iframe src="https://www.youtube.com/embed/68VtJWNkYk4" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>

[Watch on YouTube →](https://www.youtube.com/watch?v=68VtJWNkYk4)

## Troubleshooting

Having issues?

- Verify [prerequisites](getting-started/prerequisites.md) are met
- Review [testing options](getting-started/testing.md)
- Check the [GitHub Issues](https://github.com/gavdilabs/cap-mcp-plugin/issues) for known problems

## Get Help

- **Issues**: [GitHub Issues](https://github.com/gavdilabs/cap-mcp-plugin/issues)
- **Discussions**: [GitHub Discussions](https://github.com/gavdilabs/cap-mcp-plugin/discussions)
- **Documentation**: Browse this documentation site
