# Configuration

Configure the CAP MCP Plugin through your CAP application's `package.json` or `.cdsrc` file.

## Basic Configuration

Add MCP configuration to your `package.json`:

```json
{
  "cds": {
    "mcp": {
      "name": "my-mcp-server",
      "version": "1.0.0",
      "auth": "inherit",
      "instructions": "MCP server instructions for agents"
    }
  }
}
```

This creates an MCP server with your specified settings.

## Configuration Options

### Server Identity

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | package.json name | MCP server name (shown to AI clients) |
| `version` | string | package.json version | MCP server version |

**Example**:
```json
{
  "cds": {
    "mcp": {
      "name": "bookshop-mcp-server",
      "version": "1.0.0"
    }
  }
}
```

### Authentication

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `auth` | `"inherit"` \| `"none"` | `"inherit"` | Authentication mode |

**Values**:
- `"inherit"` - Use CAP's authentication system (recommended for production)
- `"none"` - No authentication (development/testing only)

See [Authentication Guide](guide/authentication.md) for detailed configuration.

### Server Instructions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `instructions` | string \| object | `null` | Server-wide guidance for AI agents |

**String format** (inline):
```json
{
  "cds": {
    "mcp": {
      "instructions": "This service manages a bookshop catalog. Use Books for searching, Authors for author info."
    }
  }
}
```

**File format** (recommended):
```json
{
  "cds": {
    "mcp": {
      "instructions": {
        "file": "./mcp-instructions.md"
      }
    }
  }
}
```

See [MCP Instructions Guide](guide/mcp-instructions.md) for detailed instructions authoring.

### Entity Wrapper Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `wrap_entities_to_actions` | boolean | `false` | Enable entity wrapper tools globally |
| `wrap_entity_modes` | string[] | `["query", "get"]` | Default CRUD operations to expose |

**Example**:
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

**Modes**:
- `"query"` - List and search operations
- `"get"` - Retrieve by ID
- `"create"` - Insert new records
- `"update"` - Modify existing records
- `"delete"` - Remove records

See [Entity Wrappers Guide](guide/entity-wrappers.md) for detailed usage.

### Capabilities

Configure MCP server capabilities:

```json
{
  "cds": {
    "mcp": {
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

**Resource Capabilities**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resources.listChanged` | boolean | `true` | Enable resource list change notifications |
| `resources.subscribe` | boolean | `false` | Enable resource subscriptions |

**Tool Capabilities**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tools.listChanged` | boolean | `true` | Enable tool list change notifications |

**Prompt Capabilities**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `prompts.listChanged` | boolean | `true` | Enable prompt list change notifications |

## Complete Configuration Example

Here's a comprehensive configuration for a production bookshop:

```json
{
  "name": "bookshop-service",
  "version": "1.2.0",
  "cds": {
    "mcp": {
      "name": "bookshop-mcp-server",
      "version": "1.2.0",
      "auth": "inherit",
      "instructions": {
        "file": "./config/mcp-instructions.md"
      },
      "wrap_entities_to_actions": true,
      "wrap_entity_modes": ["query", "get"],
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
    },
    "requires": {
      "auth": {
        "kind": "xsuaa"
      }
    }
  }
}
```

## Configuration File Locations

### package.json (Recommended)

Store configuration in your project's `package.json`:

```json
{
  "name": "my-cap-app",
  "version": "1.0.0",
  "cds": {
    "mcp": {
      "name": "my-mcp-server"
    }
  }
}
```

**Benefits**:
- Single source of truth for project metadata
- Version tracking
- Standard Node.js conventions

### .cdsrc.json

Alternatively, use CAP's `.cdsrc.json`:

```json
{
  "mcp": {
    "name": "my-mcp-server",
    "version": "1.0.0",
    "auth": "inherit"
  }
}
```

**Benefits**:
- Separate CAP configuration from package metadata
- Environment-specific configs

Learn more: [CAP Configuration](https://cap.cloud.sap/docs/node.js/cds-env)

## Environment-Specific Configuration

Use CAP's profile system for different environments:

### Development Profile

`.cdsrc.json`:
```json
{
  "mcp": {
    "auth": "none",
    "instructions": "Development server - test data only"
  },
  "[production]": {
    "mcp": {
      "auth": "inherit",
      "instructions": {
        "file": "./config/mcp-instructions-prod.md"
      }
    }
  }
}
```

### Environment Variables

Override configuration with environment variables:

```bash
# Set auth mode
export CDS_MCP_AUTH=none

# Set server name
export CDS_MCP_NAME=test-server

# Start with profile
cds serve --profile production
```

Learn more: [CAP Profiles](https://cap.cloud.sap/docs/node.js/cds-env#profiles)

## Configuration Precedence

Configuration is loaded in this order (later overrides earlier):

1. **Defaults** - Built-in plugin defaults
2. **package.json** - Project package file
3. **.cdsrc.json** - CAP configuration file
4. **Environment Variables** - Runtime overrides
5. **Profile Overrides** - Profile-specific settings

**Example**:
```json
// package.json (base)
{
  "cds": {
    "mcp": {
      "name": "my-server",
      "auth": "inherit"
    }
  }
}

// .cdsrc.json (override)
{
  "[development]": {
    "mcp": {
      "auth": "none"  // Overrides package.json in dev
    }
  }
}
```

## Validation

The plugin validates configuration at startup:

**Valid configuration**:
```
[mcp] - MCP server initialized: my-server v1.0.0
[mcp] - Authentication: inherit
[mcp] - Endpoints: /mcp, /mcp/health
```

**Invalid configuration**:
```
[mcp] - ERROR: Invalid auth mode 'invalid-mode'. Must be 'inherit' or 'none'
```

## Testing Configuration

### Verify Server Info

Check MCP server metadata:

```bash
curl http://localhost:4004/mcp/health
```

**Response**:
```json
{
  "status": "healthy",
  "server": {
    "name": "my-mcp-server",
    "version": "1.0.0"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### Use MCP Inspector

```bash
npm run inspect
```

1. Connect to `http://localhost:4004/mcp`
2. View server info - should match your configuration
3. Check capabilities, instructions, auth mode

## Common Configurations

### Development Setup

```json
{
  "cds": {
    "mcp": {
      "name": "dev-server",
      "auth": "none",
      "wrap_entities_to_actions": true,
      "wrap_entity_modes": ["query", "get", "create", "update", "delete"]
    }
  }
}
```

**Features**: No auth, full CRUD for testing

### Production Setup

```json
{
  "cds": {
    "mcp": {
      "name": "prod-server",
      "version": "1.0.0",
      "auth": "inherit",
      "instructions": {
        "file": "./config/mcp-instructions.md"
      },
      "wrap_entities_to_actions": true,
      "wrap_entity_modes": ["query", "get"],
      "capabilities": {
        "resources": {
          "listChanged": true,
          "subscribe": false
        }
      }
    },
    "requires": {
      "auth": {
        "kind": "xsuaa"
      }
    }
  }
}
```

**Features**: XSUAA auth, read-only entity wrappers, comprehensive instructions

### Minimal Setup

```json
{
  "cds": {
    "mcp": {
      "name": "simple-server"
    }
  }
}
```

**Features**: Defaults for everything - inherit auth, no entity wrappers

## Troubleshooting

### MCP Server Not Starting

**Check configuration syntax**:
```bash
# Validate JSON
cat package.json | json_pp
```

**Enable debug logging**:
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

### Configuration Not Loading

**Verify file location**:
```bash
# Check package.json exists
ls -la package.json

# Check .cdsrc.json if used
ls -la .cdsrc.json
```

**Check for typos**:
```json
{
  "cds": {
    "mcp": {  // Must be lowercase "mcp"
      "name": "my-server"
    }
  }
}
```

### Instructions File Not Found

**Verify path**:
```bash
# Relative to project root
ls -la ./mcp-instructions.md

# Check config directory
ls -la ./config/mcp-instructions.md
```

**Error message**:
```
[mcp] - WARNING: MCP instructions file not found: ./mcp-instructions.md
[mcp] - Server starting without instructions
```

## Related Topics

- [Authentication →](guide/authentication.md) - Auth configuration details
- [Entity Wrappers →](guide/entity-wrappers.md) - Wrapper configuration
- [MCP Instructions →](guide/mcp-instructions.md) - Instructions file authoring
- [CAP Configuration Guide](https://cap.cloud.sap/docs/node.js/cds-env) - CAP config system
