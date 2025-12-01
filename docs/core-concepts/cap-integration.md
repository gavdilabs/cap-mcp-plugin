# CAP Integration

Learn how the CAP MCP Plugin integrates with the Cloud Application Programming Model.

## CAP Overview

The **[SAP Cloud Application Programming Model (CAP)](https://cap.cloud.sap/docs)** is a framework for building enterprise-grade services and applications.

For comprehensive CAP documentation, visit **[cap.cloud.sap/docs](https://cap.cloud.sap/docs)**.

## Plugin Integration Architecture

The CAP MCP Plugin follows CAP's standard plugin architecture pattern. For details on how CAP plugins work and integrate with the framework, see the [official CAP Plugins documentation](https://cap.cloud.sap/docs/node.js/cds-plugins).

### Automatic Plugin Discovery

When you install the plugin:

1. **Installation**: `npm install @gavdi/cap-mcp`
2. **Discovery**: CAP finds `cds-plugin.js` in the package
3. **Registration**: Plugin registers during CAP bootstrap
4. **Integration**: Hooks into CAP lifecycle events

No manual setup required!

## CAP Lifecycle Integration

The plugin integrates with three key CAP lifecycle events:

### 1. Bootstrap Phase

```javascript
cds.on('bootstrap', async () => {
  // Plugin initializes
  // Registers Express middleware
  // Sets up MCP endpoints
});
```

**What happens**:
- HTTP endpoints created (`/mcp`, `/mcp/health`)
- Express middleware configured
- Session management initialized

### 2. Loaded Phase

```javascript
cds.on('loaded', async (csn) => {
  // Plugin parses CSN model
  // Scans for @mcp annotations
  // Validates annotation schema
});
```

**What happens**:
- Reads your CDS model (CSN format)
- Finds entities, functions, actions with `@mcp` annotations
- Validates annotation syntax
- Builds internal annotation map

### 3. Serving Phase

```javascript
cds.on('serving', async (service) => {
  // Plugin connects to services
  // Creates MCP resources and tools
  // Ready to handle MCP requests
});
```

**What happens**:
- Connects to CAP services
- Generates MCP resources from entities
- Generates MCP tools from functions/actions
- MCP server ready for clients

## CDS Annotation System

The plugin uses CDS annotations to configure MCP:

```cds
// Standard CDS annotation syntax
@mcp: {
  name: 'books',
  resource: true
}
entity Books as projection on my.Books;
```

### How It Works

1. **CDS Compiler**: Compiles your `.cds` files to CSN
2. **Plugin Parser**: Extracts `@mcp` annotations from CSN
3. **Validator**: Checks annotation schema
4. **Generator**: Creates MCP resources/tools

### Annotation Types

| CDS Element | MCP Mapping | Example |
|-------------|-------------|---------|
| Entity | Resource | `@mcp.resource` |
| Function | Tool | `@mcp.tool` |
| Action | Tool | `@mcp.tool` |
| Service | Prompts | `@mcp.prompts` |
| Element | Hint | `@mcp.hint` |
| Element | Omit | `@mcp.omit` |

Learn more: [Annotations Guide](../guide/annotations.md)

## CAP Service Integration

The plugin integrates directly with CAP services:

### Reading Data (Resources)

```cds
@mcp.resource: ['filter', 'orderby']
entity Books as projection on my.Books;
```

**What happens**:
1. MCP client queries resource
2. Plugin translates to CAP query
3. CAP executes query with authorization
4. Results returned via MCP

```javascript
// Behind the scenes
const books = await srv.run(SELECT.from('Books')
  .where('stock', '>', 10)
  .orderBy('title'));
```

### Executing Actions (Tools)

```cds
@mcp.tool: true
function getRecommendations(genre: String) returns array of String;
```

**What happens**:
1. MCP client calls tool
2. Plugin routes to CAP function
3. CAP executes with authorization
4. Results returned via MCP

```javascript
// Behind the scenes
const results = await srv.send('getRecommendations', {
  genre: 'SCIFI'
});
```

## CAP Security Integration

The plugin inherits CAP's security model:

### Authentication

```json
{
  "cds": {
    "mcp": {
      "auth": "inherit"  // Use CAP's auth
    },
    "requires": {
      "auth": {
        "kind": "xsuaa"  // CAP auth config
      }
    }
  }
}
```

Learn more: [CAP Security](https://cap.cloud.sap/docs/guides/security/)

### Authorization

```cds
// CAP authorization rules apply to MCP
@requires: 'authenticated-user'
service CatalogService {

  @restrict: [{ grant: 'READ', to: 'Viewer' }]
  entity Books as projection on my.Books;
}
```

**Result**: MCP clients must have proper CAP authorization to access resources.

### Data Privacy

```cds
entity Users {
  key ID: Integer;
  username: String;
  password: String @mcp.omit;  // Never exposed via MCP
}
```

Combines with CAP's `@PersonalData` and privacy annotations.

## OData Integration

The plugin leverages CAP's OData support:

```cds
@mcp.resource: ['filter', 'orderby', 'select']
entity Books as projection on my.Books;
```

**Supported OData Parameters**:
- `$filter` - Filter expressions
- `$orderby` - Sorting
- `$select` - Field selection
- `$top` - Limit results
- `$skip` - Pagination

Learn more: [OData in CAP](https://cap.cloud.sap/docs/advanced/odata)

## Database Integration

The plugin works with any CAP-supported database:

- **SQLite** - Development
- **SAP HANA** - Production
- **PostgreSQL** - Cloud deployments
- **H2** - Testing

No database-specific configuration needed!

## CAP Best Practices

### Use Projections

```cds
// Good: Use projections
@mcp.resource: true
entity PublicBooks as projection on my.Books {
  *,
  excluding { internalNotes }
};

// Avoid: Exposing base entities directly
```

### Leverage CAP Authorization

```cds
// Combine @mcp with @restrict
@mcp.resource: true
@restrict: [
  { grant: 'READ', to: 'Viewer' },
  { grant: ['READ', 'WRITE'], to: 'Admin' }
]
entity Books as projection on my.Books;
```

### Use CAP Types

```cds
// CAP types are mapped to MCP parameter types
function search(
  query: String,
  limit: Integer,
  includeOutOfStock: Boolean
) returns array of Books;
```

## Related Resources

- **[SAP CAP Documentation](https://cap.cloud.sap/docs)** - Official CAP docs
- **[CDS Language](https://cap.cloud.sap/docs/cds/)** - CDS reference
- **[CAP Annotations](https://cap.cloud.sap/docs/cds/annotations)** - Annotation system
- **[CAP Security](https://cap.cloud.sap/docs/guides/security/)** - Security guide

## Next Steps

- [Architecture →](core-concepts/architecture.md) - System architecture with diagrams
- [Data Flow →](core-concepts/data-flow.md) - Request/response flow
- [Annotations →](guide/annotations.md) - Complete annotation guide
