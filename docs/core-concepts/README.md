# Core Concepts

Understand the fundamental concepts behind the CAP MCP Plugin and how it bridges CAP applications with AI agents.

## In This Section

- [What is MCP?](core-concepts/what-is-mcp.md) - Introduction to Model Context Protocol
- [CAP Integration](core-concepts/cap-integration.md) - How the plugin integrates with CAP
- [Architecture](core-concepts/architecture.md) - System architecture overview
- [Data Flow](core-concepts/data-flow.md) - Request/response flow diagrams

## Key Concepts

### Model Context Protocol (MCP)

MCP is an open protocol that enables AI applications to securely interact with data sources and tools. Learn more in the [official MCP documentation](https://modelcontextprotocol.io).

### CAP Integration

The plugin automatically transforms your CAP services into MCP servers using simple `@mcp` annotations, no additional coding required.

### Architecture Layers

1. **MCP Client Layer** - AI agents (Claude, etc.)
2. **Plugin Layer** - HTTP endpoints, session management, annotation parsing
3. **CAP Layer** - Your existing CAP services and entities
4. **Data Layer** - Your database

## Related Resources

- [SAP CAP Documentation](https://cap.cloud.sap/docs)
- [Model Context Protocol Specification](https://modelcontextprotocol.io)
