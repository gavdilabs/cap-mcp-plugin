## Entity Tools: Quick Guide

This plugin can expose CAP entities as MCP tools so LLM clients can list, get, create, and update data through simple, well-named tools.

### What gets created

For an annotated entity (e.g., `CatalogService.Books`) the plugin can register tools with predictable names:

- `CatalogService_Books_query`: List rows with select/where/orderby/top/skip
- `CatalogService_Books_get`: Get one row by key(s)
- `CatalogService_Books_create`: Create a row (optional)
- `CatalogService_Books_update`: Update a row by key(s) (optional)
- `CatalogService_Books_delete`: Delete a row by key(s) (optional)

The names are intentionally descriptive for humans and LLMs: `Service_Entity_mode`.

### How to enable

Global (package.json or .cdsrc):

```json
{
  "cds": {
    "mcp": {
      "wrap_entities_to_actions": true,
      "wrap_entity_modes": ["query", "get"]
    }
  }
}
```

Per-entity (in CDS):

```cds
annotate CatalogService.Books with @mcp.wrap: {
  tools: true,
  modes: ['query','get','create','update','delete'],
  hint: 'Use for read and write demo operations'
};
```

Rules of precedence:

- If `@mcp.wrap.tools` is set on the entity, it takes precedence over global.
- `@mcp.wrap.modes` overrides the global `wrap_entity_modes` for that entity.

Recommended defaults: enable only `query` and `get` globally; opt into `create`/`update`/`delete` per entity.

### Inputs and behavior

- `query`: structured inputs validated by zod
  - `top`, `skip`, `select`, `orderby`, `where`, `q`, `return` (rows|count|aggregate), `aggregate`
  - `q` performs a simple string contains on string fields
  - `return: 'count'` returns `{ count: number }`
  - `return: 'aggregate'` returns aggregation rows
- `get`: keys required; for single-key entities you can pass the value directly (shorthand)
- `create`: non-association fields as-is; associations via `<assoc>_ID`
- `update`: keys required; non-key fields optional; associations via `<assoc>_ID`
- `delete`: keys required; this operation cannot be undone

All tools run with a standard timeout and produce consistent MCP responses; errors are returned as JSON text payloads.

### Discovery for LLMs

Use `cap_describe_model` to help models understand services/entities:

- Inputs: `service?`, `entity?`, `format?`
- Returns fields, keys, and example tool calls (names and example payloads)

Add context for models via per-entity hints:

```cds
annotate CatalogService.Books with @mcp.wrap: { tools: true, hint: 'Read-only reporting' };
```

The hint is appended to the tool descriptions to guide LLM usage.

### Logging and debugging

- The plugin logs under `cds-mcp` and `mcp` channels; enable debug via package.json `.cds.log.levels.mcp = "debug"`.
- Tool handlers log execution time and key steps.

### Test coverage summary

- Unit tests cover annotation parsing and tool registration
- Integration tests cover:
  - tools/list includes entity wrappers when enabled (global and per-entity)
  - global modes only listing query/get
  - per-entity override (e.g., update-only)

### Security notes

- By default, authentication is inherited from CAP ("inherit").
- Tool calls execute in the current CAP user context; use CAP authorization as usual.


