# Prerequisites

Before installing the CAP MCP Plugin, ensure you have the following requirements met.

## System Requirements

### Node.js
- **Version**: 18 or higher
- **Download**: [nodejs.org](https://nodejs.org)

Check your Node.js version:
```bash
node --version
```

### SAP Cloud Application Programming Model (CAP)
- **Version**: 9 or higher
- **Documentation**: [cap.cloud.sap/docs](https://cap.cloud.sap/docs)

If you're new to CAP, we recommend starting with the [CAP Getting Started Guide](https://cap.cloud.sap/docs/get-started/).

### Express
- **Version**: 4 or higher
- CAP applications typically include Express by default

## CAP Knowledge Required

To effectively use this plugin, you should have basic familiarity with:

- **CDS Modeling**: Understanding of [CDS syntax and entity definitions](https://cap.cloud.sap/docs/cds/)
- **CAP Services**: How to [define and implement CAP services](https://cap.cloud.sap/docs/guides/services)
- **Annotations**: Basic understanding of [CDS annotations](https://cap.cloud.sap/docs/cds/annotations)

## Optional but Recommended

### TypeScript
While not required, TypeScript is recommended for type safety and better development experience:
```bash
npm install -g typescript
```

### MCP Inspector
For testing your MCP implementation:
```bash
npx @modelcontextprotocol/inspector
```

## Verify Your Setup

Before proceeding with installation, verify your environment:

```bash
# Check Node.js version (should be 18+)
node --version

# Check npm version
npm --version

# Check if you have a CAP project
cds --version
```

If all checks pass, you're ready to install the plugin!

## Next Steps

- [Quick Start →](getting-started/quick-start.md) - Install the plugin and create your first MCP server
- [Testing →](getting-started/testing.md) - Learn how to test your implementation
