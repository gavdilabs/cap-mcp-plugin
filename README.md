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

**This plugin is currently in active development (v0.9.0) and is not ready for production use.**
APIs and annotations may change in future releases. Use in development and testing environments only.

Version 1.0 of the plugin is planned to release shortly after auth integration is complete.

## 📦 Installation

```bash
npm install @gavdi/cap-mcp
```

The plugin follows CAP's standard plugin architecture and will automatically integrate with your CAP application.

## 🎯 Features

This plugin transforms your annotated CAP services into a fully functional MCP server that can be consumed by any MCP-compatible AI client.

- **📊 Resources**: Expose CAP entities as MCP resources with OData v4 query capabilities
- **🔧 Tools**: Convert CAP functions and actions into executable MCP tools
- **💡 Prompts**: Define reusable prompt templates for AI interactions
- **🔄 Auto-generation**: Automatically creates MCP server endpoints based on annotations
- **⚙️ Flexible Configuration**: Support for custom parameter sets and descriptions

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

The plugin automatically:
- Scans your CAP service definitions for `@mcp` annotations
- Generates appropriate MCP resources, tools, and prompts
- Creates ResourceTemplates with proper OData v4 query parameter support

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

## 🧰 Testing Locally

If you want to test the MCP implementation you have made on your CAP application locally, you have 2 options available (that does not involve direct integration with AI Agent).

### Option #1 - MCP Inspector

You can inspect the MCP implementation by utilizing the official `@modelcontextprotocol/inspector`.

This inspector can be started up through either the included `npm run inspect` command, or by running `npx @modelcontextprotocol/inspector`.

For plugin implementation implementation in your own project it is recommended to add the above command to your own script collection.

For more information on the inspector, please [see the official documentation](https://github.com/modelcontextprotocol/inspector).

### Option #2 - Bruno Collection

This repository comes with a Bruno collection available that includes some example queries you can use to verify your MCP implementation. These can be found in the `bruno` directory.

## 🤝 Contributing

Contributions are welcome! This is an open-source project aimed at bridging CAP applications with the AI ecosystem.

- **Issues**: Report bugs and request features
- **Pull Requests**: Submit improvements and fixes
- **Documentation**: Help improve examples and guides
- **Testing**: Share your use cases and edge cases

## 📄 License

This project is licensed under the Apache-2.0 License - see the [LICENSE.md](LICENSE.md) file for details.

## 🔗 Resources

- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [SAP CAP Documentation](https://cap.cloud.sap)
- [OData v4 Specification](https://odata.org)

---
(c) Copyright by Gavdi Labs 2025 - All Rights Reserved

**Transform your CAP applications into AI-ready systems with the power of the Model Context Protocol.**
