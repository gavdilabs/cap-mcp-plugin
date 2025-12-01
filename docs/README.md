# CAP MCP Plugin

> Transform your CAP services into AI-accessible MCP servers with simple annotations

[![NPM Version](https://img.shields.io/npm/v/%40gavdi%2Fcap-mcp)](https://www.npmjs.com/package/@gavdi/cap-mcp)
[![NPM License](https://img.shields.io/npm/l/%40gavdi%2Fcap-mcp)](https://github.com/gavdilabs/cap-mcp-plugin/blob/main/LICENSE.md)
[![NPM Downloads](https://img.shields.io/npm/dm/%40gavdi%2Fcap-mcp)](https://www.npmjs.com/package/@gavdi/cap-mcp)

## What is CAP MCP?

The CAP MCP Plugin is a [Cloud Application Programming (CAP)](https://cap.cloud.sap) plugin that automatically generates [Model Context Protocol (MCP)](https://modelcontextprotocol.io) servers from your CAP services using simple annotations. No additional coding required.

### The Power of MCP for CAP Applications

The Model Context Protocol bridges the gap between your enterprise data and AI agents. By integrating MCP with your CAP applications, you unlock:

- **🤖 AI-Native Data Access** - Your CAP services become directly accessible to AI agents like Claude
- **🏢 Enterprise Integration** - Seamlessly connect AI tools to your SAP systems and business logic
- **⚡ Intelligent Automation** - Enable AI agents to perform complex business operations
- **👨‍💻 Developer Productivity** - Allow AI assistants to help developers understand and work with your CAP data models
- **📊 Business Intelligence** - Transform structured business data into AI-queryable resources

## Quick Start

### Installation

```bash
npm install @gavdi/cap-mcp
```

The plugin follows CAP's standard plugin architecture and will automatically integrate with your CAP application.

### Add Annotations

```cds
service CatalogService {
  @mcp: {
    name: 'books',
    description: 'Book catalog with search and filtering',
    resource: ['filter', 'orderby', 'select', 'top']
  }
  entity Books as projection on my.Books;

  @mcp: {
    name: 'get-recommendations',
    description: 'Get personalized book recommendations',
    tool: true
  }
  function getRecommendations(genre: String) returns array of String;
}
```

### Start Your Server

```bash
cds serve
```

Your MCP server is now available at `http://localhost:4004/mcp`!

[Get Started →](/getting-started/)

## Key Features

### 📊 Resources
Expose CAP entities as MCP resources with OData v4 query capabilities. Enable natural language queries like "Find books by Stephen King with stock > 20".

[Learn More →](/guide/resources.md)

### 🔧 Tools
Convert CAP functions and actions into executable MCP tools. Let AI agents perform business operations through your CAP services.

[Learn More →](/guide/tools.md)

### 🎯 Entity Wrappers
Automatically generate query/get/create/update/delete tools for your entities. Perfect for LLM-driven CRUD operations.

[Learn More →](/guide/entity-wrappers.md)

### 💡 Prompts
Define reusable prompt templates with variable substitution for common AI interactions.

[Learn More →](/guide/prompts.md)

### 🔒 Data Privacy
Protect sensitive data with `@mcp.omit` annotations to exclude fields from MCP responses.

[Learn More →](/guide/data-privacy.md)

### ⚙️ Flexible Configuration
Customize authentication, entity wrappers, server instructions, and more through simple configuration.

[Learn More →](/guide/configuration.md)

## Learn by Watching

<div class="video-container">
  <iframe src="https://www.youtube.com/embed/68VtJWNkYk4" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>

[Watch on YouTube →](https://www.youtube.com/watch?v=68VtJWNkYk4)

## Example: Workflow Approval

```cds
service WorkflowService {
  @mcp: {
    name: 'get-my-pending-approval',
    description: 'Fetches workflows awaiting approval by the specified user',
    tool: true
  }
  function getPendingApproval(userId: String) returns array of Workflows;
}
```

**User**: "Hey Claude, do I have any workflows pending approval?"

**AI Agent**: Calls the `get-my-pending-approval` tool and responds:

> You have 3 workflows pending your approval:
>
> • **Purchase Order #PO-2024-001**
>   Submitted by: Sarah Johnson
>   Amount: $12,500
>
> • **Budget Request - Marketing Q2**
>   Submitted by: Mike Chen
>   Amount: $45,000
>
> Would you like me to help you review any of these in detail?

[View More Examples →](/examples/)

## Documentation Sections

<div class="grid-container">
  <div class="grid-item">
    <h3>🚀 Getting Started</h3>
    <p>Install the plugin and create your first MCP server in 5 minutes.</p>
    <a href="/getting-started/">Get Started →</a>
  </div>

  <div class="grid-item">
    <h3>📖 User Guide</h3>
    <p>Complete guide to annotations, configuration, and best practices.</p>
    <a href="/guide/">Read Guide →</a>
  </div>

  <div class="grid-item">
    <h3>💡 Examples</h3>
    <p>Real-world examples, tutorials, and common patterns.</p>
    <a href="/examples/">View Examples →</a>
  </div>
</div>

## Community & Support

- **GitHub**: [gavdilabs/cap-mcp-plugin](https://github.com/gavdilabs/cap-mcp-plugin)
- **NPM**: [@gavdi/cap-mcp](https://www.npmjs.com/package/@gavdi/cap-mcp)
- **Issues**: [Report bugs](https://github.com/gavdilabs/cap-mcp-plugin/issues)
- **Discussions**: [Ask questions](https://github.com/gavdilabs/cap-mcp-plugin/discussions)

## Resources

- [Model Context Protocol](https://modelcontextprotocol.io) - Official MCP documentation
- [SAP CAP Documentation](https://cap.cloud.sap/docs) - CAP framework documentation
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector) - Testing tool for MCP servers

## License

Apache-2.0 - See [LICENSE.md](https://github.com/gavdilabs/cap-mcp-plugin/blob/main/LICENSE.md)

---

**Transform your CAP applications into AI-ready systems with the power of the Model Context Protocol.**
