# Testing Your MCP Implementation

Learn how to test and verify your MCP implementation before deploying to production.

## Testing Methods

There are three main approaches to testing your MCP server:

1. **MCP Inspector** - Interactive GUI testing tool
2. **Bruno Collection** - HTTP API testing
3. **Automated Tests** - Integration and unit tests

## Method 1: MCP Inspector (Recommended)

The MCP Inspector is the official testing tool from Anthropic for MCP servers.

### Install and Run

You can run the inspector without installing:

```bash
npx @modelcontextprotocol/inspector
```

Or install it globally:

```bash
npm install -g @modelcontextprotocol/inspector
mcp-inspector
```

### Quick Start Script

Add this to your `package.json` for convenience:

```json
{
  "scripts": {
    "inspect": "npx @modelcontextprotocol/inspector"
  }
}
```

Then run:
```bash
npm run inspect
```

### Connect to Your Server

1. Start your CAP server: `cds serve`
2. Run the inspector: `npm run inspect`
3. In the inspector, connect to: `http://localhost:4004/mcp`

### What You Can Test

The inspector allows you to:

- **List Resources** - See all available MCP resources
- **Query Resources** - Test resource queries with different parameters
- **List Tools** - View all available tools
- **Execute Tools** - Call tools with parameters
- **Test Prompts** - Try prompt templates
- **View Server Info** - Check server metadata and capabilities

### Example Inspector Session

```
1. Connect to http://localhost:4004/mcp
2. Click "List Resources" → See your annotated entities
3. Select "books" resource
4. Test query: {"filter": "stock gt 10", "top": 5}
5. View formatted results
```

For more details, see the [official MCP Inspector documentation](https://github.com/modelcontextprotocol/inspector).

## Method 2: Bruno Collection

This repository includes a Bruno collection for HTTP-based testing.

### What is Bruno?

[Bruno](https://www.usebruno.com/) is an open-source API client similar to Postman, but with Git-friendly file storage.

### Using the Collection

1. **Install Bruno** (if needed):
   - Download from [usebruno.com](https://www.usebruno.com/)

2. **Open the Collection**:
   - The collection is in the `bruno/` directory
   - Open Bruno → "Open Collection" → Select `bruno/` folder

3. **Available Requests**:
   - Health Check - `GET /mcp/health`
   - List Resources - `POST /mcp` (resources/list)
   - List Tools - `POST /mcp` (tools/list)
   - List Prompts - `POST /mcp` (prompts/list)
   - Execute Tool - `POST /mcp` (tools/call)

### Example Requests

**Health Check:**
```http
GET http://localhost:4004/mcp/health
```

**List Resources:**
```http
POST http://localhost:4004/mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "resources/list"
}
```

**Query Resource:**
```http
POST http://localhost:4004/mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "resources/read",
  "params": {
    "uri": "books?filter=stock gt 10&top=5"
  }
}
```

### Alternative: cURL

If you prefer command-line testing:

```bash
# Health check
curl http://localhost:4004/mcp/health

# List resources
curl -X POST http://localhost:4004/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "resources/list"
  }'
```

## Method 3: Automated Testing

Run the plugin's test suite to verify functionality.

### Unit Tests

Test specific components:

```bash
# Test annotation parsing
npm test -- --testPathPattern=annotations

# Test MCP functionality
npm test -- --testPathPattern=mcp

# Test security features
npm test -- --testPathPattern=security

# Test authentication
npm test -- --testPathPattern=auth
```

### Integration Tests

Test end-to-end functionality:

```bash
npm test -- --testPathPattern=integration
```

### Coverage Reports

Generate code coverage:

```bash
npm run test:coverage
```

### Watch Mode

Run tests continuously during development:

```bash
npm test -- --watch
```

### Verbose Output

See detailed test output:

```bash
npm test -- --verbose
```

## Demo Application

The plugin includes a demo bookshop application for testing.

### Start Demo App

```bash
npm run mock
```

This starts a complete CAP bookshop with MCP annotations.

### Demo Features

The demo includes:
- Books and Authors entities as resources
- Book recommendation tool
- Author search tool
- Prompt templates
- Entity wrappers

### Explore Demo Code

Check the demo implementation:
- **Model**: `test/demo/db/schema.cds`
- **Service**: `test/demo/srv/cat-service.cds`
- **Data**: `test/demo/db/data/`

## Testing Checklist

Before deploying, verify:

- [ ] **Health endpoint** responds correctly
- [ ] **Resources list** shows all annotated entities
- [ ] **Resource queries** work with filters, ordering, pagination
- [ ] **Tools list** shows all annotated functions/actions
- [ ] **Tool execution** works with correct parameters
- [ ] **Prompts list** shows defined templates (if any)
- [ ] **Authentication** works as configured
- [ ] **Error handling** returns proper error messages
- [ ] **Performance** is acceptable under load

## Common Test Scenarios

### Test Resource Queries

```javascript
// Basic query
GET /books

// With filter
GET /books?$filter=stock gt 10

// With ordering
GET /books?$orderby=title

// With pagination
GET /books?$top=10&$skip=20

// Combined
GET /books?$filter=stock gt 0&$orderby=price desc&$top=5
```

### Test Tools

```javascript
// Simple tool call
{
  "method": "tools/call",
  "params": {
    "name": "get-recommendations",
    "arguments": {
      "genre": "SCIFI",
      "limit": 5
    }
  }
}
```

### Test Error Handling

```javascript
// Invalid filter
GET /books?$filter=invalid syntax

// Missing required parameter
{
  "method": "tools/call",
  "params": {
    "name": "get-recommendations",
    "arguments": {} // missing required params
  }
}
```

## Troubleshooting Tests

### Inspector Can't Connect

1. Verify server is running: `curl http://localhost:4004/mcp/health`
2. Check port isn't blocked by firewall
3. Try different port in CAP configuration

### Bruno Collection Not Working

1. Ensure CAP server is running
2. Check request URLs match your server port
3. Verify Content-Type headers are set

### Tests Failing

1. Run `npm install` to ensure dependencies are current
2. Clear jest cache: `npm test -- --clearCache`
3. Check Node.js version is 18+

## Next Steps

Once testing is complete:

- [Configuration →](guide/configuration.md) - Fine-tune your setup
- [Authentication →](guide/authentication.md) - Secure your MCP server
- [Examples →](examples/README.md) - Explore real-world examples
