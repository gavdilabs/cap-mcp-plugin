# What is MCP?

The Model Context Protocol (MCP) is an open protocol that enables AI applications to securely connect to data sources and tools.

## Official MCP Documentation

For comprehensive information about the Model Context Protocol, please visit the **[official MCP documentation](https://modelcontextprotocol.io)**.

Key topics covered in the official docs:
- Protocol specification
- Architecture and design
- Client implementations
- Server implementations
- Security considerations

## MCP in a Nutshell

MCP provides a standardized way for AI agents to:

- **Access Data**: Query databases, APIs, and other data sources
- **Execute Tools**: Perform actions like calculations, API calls, or business logic
- **Use Prompts**: Leverage pre-defined prompt templates
- **Maintain Context**: Keep conversation context across interactions

## Why MCP Matters for CAP

The CAP MCP Plugin bridges your SAP CAP applications with the AI ecosystem:

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│             │  MCP    │   CAP MCP        │   CAP   │             │
│  AI Agent   │◄───────►│   Plugin         │◄───────►│ CAP Service │
│  (Claude)   │Protocol │                  │  Calls  │             │
└─────────────┘         └──────────────────┘         └─────────────┘
```

### Benefits

1. **Enterprise AI Integration** - Connect AI agents to your SAP business data
2. **Standardized Interface** - Use industry-standard protocol
3. **Security** - Leverage CAP's authentication and authorization
4. **Simplicity** - Add AI capabilities with simple annotations

## MCP Concepts

### Resources

Resources represent queryable data entities. In CAP terms:
- CAP Entity → MCP Resource
- OData queries → MCP resource queries

Learn more in the [MCP Resources specification](https://modelcontextprotocol.io/docs/concepts/resources).

### Tools

Tools represent executable functions. In CAP terms:
- CAP Functions/Actions → MCP Tools
- Function parameters → Tool parameters

Learn more in the [MCP Tools specification](https://modelcontextprotocol.io/docs/concepts/tools).

### Prompts

Prompts are reusable templates for AI interactions:
- Pre-defined conversation starters
- Parameterized instructions
- Role-based prompts

Learn more in the [MCP Prompts specification](https://modelcontextprotocol.io/docs/concepts/prompts).

## How This Plugin Implements MCP

The CAP MCP Plugin implements MCP by:

1. **Automatic Server Generation**: Creates an MCP server from your CAP service
2. **Annotation-Based Configuration**: Uses `@mcp` annotations to define resources and tools
3. **HTTP Transport**: Exposes MCP via HTTP endpoints
4. **CAP Integration**: Leverages CAP's authentication, authorization, and data access

```cds
// Simple annotation creates an MCP resource
@mcp: {
  name: 'books',
  description: 'Book catalog',
  resource: true
}
entity Books as projection on my.Books;
```

This automatically:
- Creates an MCP resource named "books"
- Enables querying with OData parameters
- Inherits CAP security settings
- Works with any MCP client

## MCP Ecosystem

The CAP MCP Plugin is part of the broader MCP ecosystem:

- **MCP Specification**: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **MCP SDK**: TypeScript SDK for building servers
- **MCP Clients**: Claude Desktop, Claude Code, custom clients
- **MCP Servers**: File systems, databases, APIs, and now CAP!

## Related Resources

- **[Official MCP Documentation](https://modelcontextprotocol.io)** - Complete protocol specification
- **[MCP GitHub](https://github.com/modelcontextprotocol)** - Official repositories
- **[CAP Integration](core-concepts/cap-integration.md)** - How the plugin integrates with CAP
- **[Architecture](core-concepts/architecture.md)** - System architecture overview

## Next Steps

- [CAP Integration →](core-concepts/cap-integration.md) - Learn how MCP integrates with CAP
- [Architecture →](core-concepts/architecture.md) - Understand the plugin architecture
- [Quick Start →](getting-started/quick-start.md) - Build your first MCP server
