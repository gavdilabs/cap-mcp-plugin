# MCP HTTP API Integration Tests

This directory contains integration tests for the MCP HTTP API endpoints exposed by the CAP MCP plugin.

## Test Coverage

### ✅ Completed Integration Tests

- **Session Management** (`mcp-session.spec.ts`) - 10 tests
  - Session initialization, headers, cleanup, concurrent sessions, error handling
- **Resources API** (`mcp-resources.spec.ts`) - 14 tests
  - Resource discovery, reading, OData validation, error handling, performance
- **Tools API** (`mcp-tools.spec.ts`) - 5 tests
  - Tool discovery, execution, parameter validation, error handling
- **Prompts API** (`mcp-prompts.spec.ts`) - 5 tests
  - Prompt discovery, template rendering, parameter validation, error handling

**Total: 34 integration tests** ✅

## MCP Protocol Method Names

### Standard MCP Methods (Correct)

| Category      | Method                     | Purpose                           |
| ------------- | -------------------------- | --------------------------------- |
| **Session**   | `initialize`               | Initialize MCP session            |
| **Tools**     | `tools/list`               | List available tools              |
| **Tools**     | `tools/call`               | Execute a tool                    |
| **Resources** | `resources/list`           | List available resources          |
| **Resources** | `resources/templates/list` | List resource templates           |
| **Resources** | `resources/read`           | Read resource content             |
| **Resources** | `resources/subscribe`      | Subscribe to resource changes     |
| **Resources** | `resources/unsubscribe`    | Unsubscribe from resource changes |
| **Prompts**   | `prompts/list`             | List available prompts            |
| **Prompts**   | `prompts/get`              | Get prompt template               |

### ❌ Incorrect Method Names (Found in Bruno Collection)

- ❌ `mcp/callTool` → ✅ `tools/call`

## Test Architecture

### Test Server Fixture

- **`test-server.ts`** - Reusable test server setup with MCP plugin
- **Express app** with proper middleware and MCP endpoints
- **Mock CSN model** with test annotations for tools, resources, and prompts
- **JSON response mode** enabled for testing (`enableJsonResponse: true`)

### Test Structure

- **Supertest** for HTTP assertions without network overhead
- **Proper MCP headers** (`Accept: application/json, text/event-stream`)
- **Session management** with `mcp-session-id` header
- **JSON-RPC validation** for all responses

## Key Integration Test Principles

### ✅ Correct Expectations

1. **Empty arrays** when no resources/tools/prompts are registered (not errors)
2. **JSON-RPC error responses** (not HTTP 4xx/5xx for protocol errors)
3. **Graceful degradation** when backends aren't available
4. **Proper response structure** (`jsonrpc: "2.0"`, `id`, `result`/`error`)

### ✅ Real-World Testing

- Tests work with **actual MCP server implementation**
- **Session lifecycle** properly managed
- **Concurrent requests** supported
- **Security validation** for malicious inputs
- **Performance** under load

## Running Tests

```bash
# All integration tests
npm run test:integration

# Specific test file
npm run test:integration -- --testPathPattern=mcp-tools

# All tests (unit + integration)
npm test

# With verbose output
npm run test:integration -- --verbose
```

## Next Steps

The integration test framework is complete and ready for:

1. **Real CAP service integration** - Connect to actual CAP services
2. **Data backend testing** - Test with real database content
3. **Authentication testing** - Add auth middleware tests
4. **Performance benchmarking** - Response time validation
