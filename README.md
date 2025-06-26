# CAP MCP Plugin - AI With Ease

> This implementation is based on the Model Context Protocol (MCP) put forward by Anthropic.
> For more information on MCP, please have a look at their [official documentation.](https://modelcontextprotocol.io/introduction)

## Annotations

### @mcp.resource

Resource annotations will by default assume that the entity annotated should be filterable, sortable, etc., meaning that we can perform querying on it.
If you do not wish this, you can select specifically what types of querying is available by using the following options as an array to the annotation:

- `select`
- `filter`
- `sort`
- `skip`,
- `top`

### @mcp.tool

Tool annotations can be done on both bound and unbound functions.


### @mcp.prompt



### Example

```cds
// Resource Annotation
@mcp.resource
entity MyEntity as projection on db.MyEntity;

/* OR */

@mcp.resource: ['filter', 'sort', 'select']
entity MyEntity as projection on db.MyEntity;

// Tool Annotation (Unbound operation)
function myFunction() returns String;

// Tool Annotation (Bound operation)
entity MyEntity as projection on db.MyEntity actions {
    function myFunction() returns String;
};

// Prompt Annotation

```

## Testing MCP Implementation

Testing of the MCP plugin can be done by running the Mock service and using the following curl commands, or by utilizing the Bruno collection found within the repo.

**Initialize HTTP Session:**
```shell
curl -i -X POST http://localhost:4004/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer my-secret-token" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {
        "roots": {
          "listChanged": true
        },
        "sampling": {}
      },
      "clientInfo": {
        "name": "curl-client",
        "version": "1.0.0"
      }
    }
  }'
```

## TODO

- [ ] Prompt handling in MCP (design + implementation)
- [ ] XSUAA integration
- [ ] Configuration through package.json/cdsrc
- [ ] Expand queries for resources
- [ ] Automated tests
- [ ] Add support for image, audio and other content responses
- [ ] Add support for completion to help guide MCP client
