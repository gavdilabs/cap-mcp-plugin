# CAP MCP Plugin - AI With Ease

> This implementation is based on the Model Context Protocol (MCP) put forward by Anthropic.
> For more information on MCP, please have a look at their [official documentation.](https://modelcontextprotocol.io/introduction)

> 🔧 **In active development - 1.0 release scheduled for Summer 2025**

# CAP-MCP Plugin

A CAP (Cloud Application Programming) plugin that automatically generates Model Context Protocol (MCP) servers from your CAP services using simple annotations.
Transform your CAP OData services into AI-accessible resources, tools, and prompts with minimal configuration.

## 🚀 The Power of MCP for CAP Applications

The Model Context Protocol bridges the gap between your enterprise data and AI agents.
By integrating MCP with your CAP applications, you unlock:

- **AI-Native Data Access**: Your CAP services become directly accessible to AI agents like Claude, enabling natural language queries against your business data
- **Enterprise Integration**: Seamlessly connect AI tools to your SAP systems, databases, and business logic
- **Intelligent Automation**: Enable AI agents to perform complex business operations by combining multiple CAP service calls
- **Developer Productivity**: Allow AI assistants to help developers understand, query, and work with your CAP data models
- **Business Intelligence**: Transform your structured business data into AI-queryable resources for insights and analysis

## ⚠️ Development Status

**This plugin is currently in active development (v0.9.2) and approaching production readiness.**
APIs and annotations may change in future releases. Authentication and security features are implemented and tested.

Version 1.0 of the plugin is scheduled for release in Summer 2025 after final stability testing and documentation completion.

## 📦 Installation

```bash
npm install @gavdi/cap-mcp
```

The plugin follows CAP's standard plugin architecture and will automatically integrate with your CAP application.

## 🚀 Quick Setup

### Prerequisites

- **Node.js**: Version 18 or higher
- **SAP CAP**: Version 9 or higher
- **Express**: Version 4 or higher
- **TypeScript**: Optional but recommended

### Step 1: Install the Plugin

```bash
npm install @gavdi/cap-mcp
```

### Step 2: Configure Your CAP Application

Add MCP configuration to your `package.json`:

```json
{
  "cds": {
    "mcp": {
      "name": "my-bookshop-mcp",
      "auth": "inherit",
      "wrap_entities_to_actions": false,
      "wrap_entity_modes": ["query", "get"]
    }
  }
}
```

### Step 3: Add MCP Annotations

Annotate your CAP services with `@mcp` annotations:

```cds
// srv/catalog-service.cds
service CatalogService {

  @mcp: {
    name: 'books',
    description: 'Book catalog with search and filtering',
    resource: ['filter', 'orderby', 'select', 'top', 'skip']
  }
  entity Books as projection on my.Books;
  
  // Optionally expose Books as tools for LLMs (query/get enabled by default config)
  annotate CatalogService.Books with @mcp.wrap: {
    tools: true,
    modes: ['query','get'],
    hint: 'Use for read-only lookups of books'
  };

  @mcp: {
    name: 'get-book-recommendations',
    description: 'Get personalized book recommendations',
    tool: true
  }
  function getRecommendations(genre: String, limit: Integer) returns array of String;
}
```

### Step 4: Start Your Application

```bash
cds serve
```

The MCP server will be available at:
- **MCP Endpoint**: `http://localhost:4004/mcp`
- **Health Check**: `http://localhost:4004/mcp/health`

### Step 5: Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Connect to `http://localhost:4004/mcp` to explore your generated MCP resources, tools, and prompts.

## 🎯 Features

This plugin transforms your annotated CAP services into a fully functional MCP server that can be consumed by any MCP-compatible AI client.

- **📊 Resources**: Expose CAP entities as MCP resources with OData v4 query capabilities
- **🔧 Tools**: Convert CAP functions and actions into executable MCP tools
- **🧩 Entity Wrappers (optional)**: Expose CAP entities as tools (`query`, `get`, and optionally `create`, `update`) for LLM tool use while keeping resources intact
- **💡 Prompts**: Define reusable prompt templates for AI interactions
- **🔄 Auto-generation**: Automatically creates MCP server endpoints based on annotations
- **⚙️ Flexible Configuration**: Support for custom parameter sets and descriptions

## 🧪 Testing & Inspector

- Run tests: `npm test`
- Start demo app: `npm run mock`
- Inspector: `npx @modelcontextprotocol/inspector`

### New wrapper tools

When `wrap_entities_to_actions` is enabled (globally or via `@mcp.wrap.tools: true`), you will see tools named like:

- `CatalogService_Books_query`
- `CatalogService_Books_get`
- `CatalogService_Books_create` (if enabled)
- `CatalogService_Books_update` (if enabled)

Each tool includes a description with fields and OData notes to guide the model. You can add `@mcp.wrap.hint` per entity to enrich descriptions for LLMs.

### Bruno collection

The `bruno/` folder contains HTTP requests for the MCP endpoint (handy for local manual testing using Bruno or any HTTP client). You may add calls for `tools/list` and `tools/call` to exercise the new wrapper tools.

## 📝 Usage

### Resource Annotations

Transform CAP entities into AI-queryable resources:

```cds
service CatalogService {

  @readonly
  @mcp: {
    name       : 'books',
    description: 'Book data list',
    resource   : [
      'filter',
      'orderby',
      'select',
      'skip',
      'top'
    ]
  }
  entity Books as projection on my.Books;

  // Enable all OData query options
  @mcp: {
    name       : 'authors',
    description: 'Author data list',
    resource   : true
  }
  entity Authors as projection on my.Authors;

  // Or maybe you just want it as a static top 100 list of data?
  @mcp: {
    name       : 'genres',
    description: 'Book genre list',
    resource   : []
  }
  entity Genres as projection on my.Genres;
}
```

**Generated MCP Resource Capabilities:**
- **OData v4 Query Support**: `$filter`, `$orderby`, `$top`, `$skip`, `$select`
- **Natural Language Queries**: "Find books by Stephen King with stock > 20"
- **Dynamic Filtering**: Complex filter expressions using OData syntax
- **Flexible Selection**: Choose specific fields and sort orders

### Tool Annotations

Convert CAP functions and actions into executable AI tools:

```cds
// Service-level function
@mcp: {
  name       : 'get-author',
  description: 'Gets the desired author',
  tool       : true
}
function getAuthor(input: String) returns String;

// Entity-level action
extend projection Books with actions {
  @mcp: {
    name       : 'get-stock',
    description: 'Retrieves stock from a given book',
    tool       : true
  }
  function getStock() returns Integer;
}
```

### Prompt Templates

Define reusable AI prompt templates:

```cds
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

## 🔧 Configuration

### Plugin Configuration

Configure the MCP plugin through your CAP application's `package.json` or `.cdsrc` file:

```json
{
  "cds": {
    "mcp": {
      "name": "my-mcp-server",
      "version": "1.0.0",
      "auth": "inherit",
      "capabilities": {
        "resources": {
          "listChanged": true,
          "subscribe": false
        },
        "tools": {
          "listChanged": true
        },
        "prompts": {
          "listChanged": true
        }
      }
    }
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | package.json name | MCP server name |
| `version` | string | package.json version | MCP server version |
| `auth` | `"inherit"` \| `"none"` | `"inherit"` | Authentication mode |
| `capabilities.resources.listChanged` | boolean | `true` | Enable resource list change notifications |
| `capabilities.resources.subscribe` | boolean | `false` | Enable resource subscriptions |
| `capabilities.tools.listChanged` | boolean | `true` | Enable tool list change notifications |
| `capabilities.prompts.listChanged` | boolean | `true` | Enable prompt list change notifications |

### Authentication Configuration

The plugin supports two authentication modes:

#### `"inherit"` Mode (Default)
Uses your CAP application's existing authentication system:

```json
{
  "cds": {
    "mcp": {
      "auth": "inherit"
    },
    "requires": {
      "auth": {
        "kind": "xsuaa"
      }
    }
  }
}
```

#### `"none"` Mode (Development/Testing)
Disables authentication completely:

```json
{
  "cds": {
    "mcp": {
      "auth": "none"
    }
  }
}
```

**⚠️ Security Warning**: Only use `"none"` mode in development environments. Never deploy to production without proper authentication.

#### Authentication Flow
1. MCP client connects to `/mcp` endpoint
2. CAP authentication middleware validates credentials (if `auth: "inherit"`)
3. MCP session established with authenticated user context
4. All MCP operations (resources, tools, prompts) inherit the authenticated user's permissions

### Automatic Features

The plugin automatically:
- Scans your CAP service definitions for `@mcp` annotations
- Generates appropriate MCP resources, tools, and prompts
- Creates ResourceTemplates with proper OData v4 query parameter support
- Sets up HTTP endpoints at `/mcp` and `/mcp/health`
- Manages MCP session lifecycle and cleanup

## 🌟 Example AI Interactions

Once configured, AI agents can interact with your CAP data naturally; Let's take an example from the standard CAP Bookshop:

- **"Show me the top 5 books with highest stock"** → Queries Books resource with `$orderby=stock desc&$top=5`
- **"Find authors whose names contain 'Smith'"** → Uses `$filter=contains(name,'Smith')` on Authors resource
- **"Get the current stock for book ID 123"** → Calls the `get-stock` tool for the specified book
- **"Give me a book recommendation"** → Executes the `book-recommendation` tool

While this shows how this example CDS annotation works, the possibilities are endless and only you and your data sets the boundaries.

## 📋 Business Case Example: Workflow Approval Management

### The Setup
Your CAP service includes a workflow management system with MCP integration:

```cds
service WorkflowService {

  @mcp: {
    name       : 'get-my-pending-approval',
    description: 'Fetches workflows awaiting approval by the specified user',
    tool       : true
  }
  function getPendingApproval(userId: String) returns array of Workflows;
}
```

### The Interaction Flow

**1. User Query**
```
User: "Hey <Agent>, do I have any workflows pending approval?"
```

**2. AI Agent Processing**
- Agent recognizes this as a request for pending approval information
- Identifies the `get-my-pending-approval` tool as the appropriate method
- Determines the user's ID from context (session, authentication, etc.)

**3. MCP Tool Execution**
```javascript
// Agent calls the MCP tool
{
  "tool": "get-my-pending-approval",
  "arguments": {
    "userId": "john.doe@company.com"
  }
}
```

**4. CAP Service Processing**
- Your CAP service receives the tool call
- Executes `getPendingApproval("john.doe@company.com")`
- Queries your workflow database/system
- Returns structured workflow data

**5. AI Response**
```
Agent: "You have 3 workflows pending your approval:

• **Purchase Order #PO-2024-001**
  Submitted by: Sarah Johnson
  Amount: $12,500
  Submitted: 2 days ago

• **Budget Request - Marketing Q2**
  Submitted by: Mike Chen
  Amount: $45,000
  Submitted: 1 day ago

• **New Employee Onboarding - Jane Smith**
  Submitted by: HR Department
  Start Date: Next Monday
  Submitted: 4 hours ago

Would you like me to help you review any of these in detail?"
```

### Business Value
- **Instant Access**: No need to log into workflow systems or navigate complex UIs
- **Contextual Intelligence**: AI can prioritize based on urgency, amounts, or business rules
- **Natural Interaction**: Users can ask follow-up questions in plain language
- **Integration Ready**: Works with existing CAP-based workflow systems
- **Mobile Friendly**: Access approvals from any MCP-compatible AI client

## 🧰 Development & Testing

### Testing Your MCP Implementation

If you want to test the MCP implementation you have made on your CAP application locally, you have 2 options available (that does not involve direct integration with AI Agent).

#### Option #1 - MCP Inspector

You can inspect the MCP implementation by utilizing the official `@modelcontextprotocol/inspector`.

This inspector can be started up through either the included `npm run inspect` command, or by running `npx @modelcontextprotocol/inspector`.

For plugin implementation implementation in your own project it is recommended to add the above command to your own script collection.

For more information on the inspector, please [see the official documentation](https://github.com/modelcontextprotocol/inspector).

#### Option #2 - Bruno Collection

This repository comes with a Bruno collection available that includes some example queries you can use to verify your MCP implementation. These can be found in the `bruno` directory.

#### Option #3 - Automated Testing

Run the comprehensive test suite to validate your implementation:

```bash
# Test specific components
npm test -- --testPathPattern=annotations  # Test annotation parsing
npm test -- --testPathPattern=mcp          # Test MCP functionality
npm test -- --testPathPattern=security     # Test security boundaries
npm test -- --testPathPattern=auth         # Test authentication

# Run with detailed output
npm test -- --verbose

# Run in watch mode for development
npm test -- --watch
```

### Further reading

- Short guide on entity tools and configuration: `docs/entity-tools.md`

## 🤝 Contributing

Contributions are welcome! This is an open-source project aimed at bridging CAP applications with the AI ecosystem.

- **Issues**: Report bugs and request features
- **Pull Requests**: Submit improvements and fixes
- **Documentation**: Help improve examples and guides
- **Testing**: Share your use cases and edge cases

## 📄 License

This project is licensed under the Apache-2.0 License - see the [LICENSE.md](LICENSE.md) file for details.

## 🔧 Troubleshooting

### Common Issues

#### MCP Server Not Starting
- **Check Port Availability**: Ensure port 4004 is not in use by another process
- **Verify CAP Service**: Make sure your CAP application starts successfully with `cds serve`
- **Authentication Issues**: If using `auth: "inherit"`, ensure your CAP authentication is properly configured

#### MCP Client Connection Failures
```bash
# Check if MCP endpoint is accessible
curl http://localhost:4004/mcp/health

# Expected response:
# {"status": "healthy", "timestamp": "2025-01-XX..."}
```

#### Annotation Not Working
- **Syntax Check**: Verify your `@mcp` annotation syntax matches the examples
- **Service Deployment**: Ensure annotated entities/functions are properly deployed
- **Case Sensitivity**: Check that annotation properties use correct casing (`resource`, `tool`, `prompts`)

#### OData Query Issues
- **SDK Bug Workaround**: Due to the known `@modelcontextprotocol/sdk` bug, provide all query parameters when using dynamic queries
- **Parameter Validation**: Ensure query parameters match OData v4 syntax

#### Performance Issues
- **Resource Filtering**: Use specific `resource` arrays instead of `true` for large datasets
- **Query Optimization**: Implement proper database indexes for frequently queried fields

### Debugging

#### Enable Debug Logging
```json
{
  "cds": {
    "log": {
      "levels": {
        "mcp": "debug"
      }
    }
  }
}
```

#### Test MCP Implementation
```bash
# Use MCP Inspector for interactive testing
npm run inspect

# Or run integration tests
npm test -- --testPathPattern=integration
```

### Getting Help

- **GitHub Issues**: Report bugs at [gavdilabs/cap-mcp-plugin](https://github.com/gavdilabs/cap-mcp-plugin/issues)
- **Documentation**: Check [MCP Specification](https://modelcontextprotocol.io) for protocol details
- **CAP Support**: Refer to [SAP CAP Documentation](https://cap.cloud.sap) for CAP-specific issues

## 🚨 Performance & Limitations

### Known Limitations
- **SDK Bug**: Dynamic resource queries require all query parameters due to `@modelcontextprotocol/sdk` RFC template string issue
- **Authentication Inheritance**: MCP authentication is tightly coupled to CAP's authentication system
- **Session Cleanup**: MCP sessions are cleaned up on HTTP connection close, not on explicit disconnect

### Performance Considerations
- **Large Datasets**: Use `resource: ['top']` or similar constraints for entities with many records
- **Complex Queries**: OData query parsing adds overhead - consider caching for frequently accessed data
- **Concurrent Sessions**: Each MCP client creates a separate session - monitor memory usage with many clients

### Scale Recommendations
- **Development**: No specific limits
- **Production**: Test with expected concurrent MCP client count
- **Enterprise**: Consider load balancing for high-availability scenarios

## 🔗 Resources

- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [SAP CAP Documentation](https://cap.cloud.sap)
- [OData v4 Specification](https://odata.org)
- [MCP Inspector Tool](https://github.com/modelcontextprotocol/inspector)

---
(c) Copyright by Gavdi Labs 2025 - All Rights Reserved

**Transform your CAP applications into AI-ready systems with the power of the Model Context Protocol.**
