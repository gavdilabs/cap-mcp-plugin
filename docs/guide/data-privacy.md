# Data Privacy

Protect sensitive data by excluding specific fields from MCP responses using `@mcp.omit`.

## Why Omit Fields?

When exposing CAP entities through MCP, you may need to hide sensitive or internal fields from AI agents and MCP clients. The `@mcp.omit` annotation provides field-level privacy control.

## Basic Usage

Mark fields with `@mcp.omit` to exclude them from all MCP responses:

```cds
namespace my.bookshop;

entity Books {
  key ID            : Integer;
      title         : String;
      stock         : Integer;
      author        : Association to Authors;
      secretMessage : String  @mcp.omit;  // Hidden from all MCP responses
}
```

**Result**: The `secretMessage` field will never appear in MCP resource reads or tool responses.

## Common Use Cases

### 1. Security-Sensitive Data

Hide information that could compromise business operations:

```cds
entity Products {
  key ID            : Integer;
      name          : String;
      publicPrice   : Decimal;
      costPrice     : Decimal  @mcp.omit;  // Hide internal pricing
      supplierInfo  : String   @mcp.omit;  // Hide supplier relationships
}
```

### 2. Personal Identifiers

Protect sensitive personal information:

```cds
entity Users {
  key ID            : Integer;
      username      : String;
      email         : String;
      darkestSecret : String  @mcp.omit;  // Never exposed to MCP clients
      ssn           : String  @mcp.omit;  // Protected sensitive data
      lastLogin     : DateTime;
}
```

### 3. Internal System Fields

Exclude system-only or audit fields:

```cds
entity Books {
  key ID              : Integer;
      title           : String;
      stock           : Integer;
      internalNotes   : String   @mcp.omit;  // Staff-only notes
      auditLog        : String   @mcp.omit;  // System audit trail
      processingFlags : Integer  @mcp.omit;  // Internal state management
}
```

### 4. Compliance and Regulations

Ensure GDPR/CCPA compliance:

```cds
entity Customers {
  key ID              : Integer;
      name            : String;
      email           : String;
      creditCardHash  : String  @mcp.omit;  // PCI compliance
      taxID           : String  @mcp.omit;  // Privacy regulation
      medicalInfo     : String  @mcp.omit;  // HIPAA compliance
}
```

## How It Works

### Omission Scope

Fields marked with `@mcp.omit` are filtered from:

1. **Resources**: Field will not appear in resource read operations
2. **Entity Wrapper Tools**: Omission applies to all CRUD operations
   - `query` results exclude the field
   - `get` results exclude the field
   - `create` schema excludes from output (but allows as input)
   - `update` schema excludes from output (but allows as input)

### Input vs. Output

**Important**: Omitted fields are **only excluded from outputs**, not inputs.

```cds
entity Products {
  key ID        : Integer;
      name      : String;
      costPrice : Decimal @mcp.omit;
}
```

**Create operation**:
```typescript
// Input: costPrice can be provided
CatalogService_Products_create({
  ID: 1,
  name: "Widget",
  costPrice: 10.50  // ✅ Allowed as input
})

// Output: costPrice is hidden
{
  "ID": 1,
  "name": "Widget"
  // costPrice not returned
}
```

**Why**: Allows authorized operations while protecting data in responses.

### Query Behavior

Omitted fields remain queryable in CAP but are filtered from MCP responses:

```typescript
// CAP service query (internal)
SELECT.from('Books').where({ secretMessage: { '!=': null } })
// Works - CAP has access

// MCP resource query (external)
GET /books
// Returns books without secretMessage field
```

## Combining with Other Annotations

### With @Core.Computed

Exclude auto-generated fields:

```cds
entity Products {
  key ID        : Integer;
      name      : String;
      price     : Decimal;
      costPrice : Decimal  @mcp.omit;     // Hide internal pricing
      createdAt : DateTime @Core.Computed @mcp.omit;  // Auto-generated, hidden
      updatedAt : DateTime @Core.Computed @mcp.omit;  // Auto-generated, hidden
}
```

**Result**: Both computed fields and sensitive data are hidden from MCP.

Learn more: [CAP Annotations](https://cap.cloud.sap/docs/cds/annotations)

### With @readonly

Exclude read-only sensitive fields:

```cds
entity Users {
  key ID           : Integer;
      username     : String;
      passwordHash : String @readonly @mcp.omit;  // Never writable, never visible
      lastLoginIP  : String @readonly @mcp.omit;  // Read-only system field, hidden
}
```

### With @PersonalData

Combine with CAP privacy annotations:

```cds
using { sap.common.PersonalData } from '@sap/cds/common';

entity Customers {
  key ID              : Integer;
      name            : String @PersonalData.IsPotentiallyPersonal;
      email           : String @PersonalData.IsPotentiallyPersonal;
      ssn             : String @PersonalData.IsPotentiallySensitive @mcp.omit;
      medicalHistory  : String @PersonalData.IsPotentiallySensitive @mcp.omit;
}
```

**Result**: CAP handles privacy auditing, MCP hides sensitive fields.

Learn more: [CAP Personal Data Management](https://cap.cloud.sap/docs/guides/data-privacy/introduction)

### With CAP Authorization

Combine omission with `@restrict`:

```cds
@restrict: [
  { grant: 'READ', to: 'Viewer' },
  { grant: 'WRITE', to: 'Admin' }
]
entity Products {
  key ID        : Integer;
      name      : String;
      price     : Decimal;
      costPrice : Decimal @mcp.omit;  // Hidden even from admins via MCP
}
```

**Security layers**:
1. CAP `@restrict` - Controls who can access the entity
2. `@mcp.omit` - Controls what fields MCP exposes

Learn more: [CAP Authorization](https://cap.cloud.sap/docs/guides/security/authorization)

## Multiple Omitted Fields

Omit several fields in one entity:

```cds
entity Orders {
  key ID                : Integer;
      customerName      : String;
      totalAmount       : Decimal;

      // All hidden from MCP
      internalNotes     : String  @mcp.omit;
      profitMargin      : Decimal @mcp.omit;
      commissionAmount  : Decimal @mcp.omit;
      vendorCost        : Decimal @mcp.omit;
      processingCode    : String  @mcp.omit;
}
```

## Testing Omission

### Verify with MCP Inspector

```bash
npm run inspect
```

1. Connect to your MCP server
2. Query a resource or call an entity wrapper tool
3. Verify omitted fields don't appear in responses

### Test with Entity Wrappers

```typescript
// Query books
CatalogService_Books_query({})

// Response should not include secretMessage
[
  {
    "ID": 1,
    "title": "Foundation",
    "stock": 42
    // secretMessage not present ✅
  }
]
```

### Test with Resources

```http
GET /books

Response:
{
  "value": [
    {
      "ID": 1,
      "title": "Foundation",
      "stock": 42
      // secretMessage not present ✅
    }
  ]
}
```

## Best Practices

### 1. Default to Privacy

When in doubt, omit the field:

```cds
// Better safe than sorry
entity Users {
  key ID           : Integer;
      username     : String;
      phoneNumber  : String  @mcp.omit;  // Err on side of privacy
}
```

### 2. Document Why Fields Are Omitted

Use comments to explain omissions:

```cds
entity Products {
  key ID        : Integer;
      name      : String;
      costPrice : Decimal @mcp.omit;  // Business sensitive - wholesale cost
      apiKey    : String  @mcp.omit;  // Security - third-party API credential
}
```

### 3. Review Regularly

Audit omitted fields as your model evolves:

```cds
// Periodic review: Do we still need to omit this?
entity Books {
  legacyFlag : Boolean @mcp.omit;  // TODO: Remove after migration
}
```

### 4. Combine with CAP Privacy Features

Don't rely solely on `@mcp.omit`:

```cds
entity Users {
  key ID       : Integer;
      password : String @mcp.omit           // MCP privacy
                        @assert.format: ''  // CAP never returns passwords
                        @readonly;          // Never writable via OData
}
```

### 5. Use with Projections

Create separate projections for different audiences:

```cds
// Internal entity
entity BooksInternal {
  key ID            : Integer;
      title         : String;
      costPrice     : Decimal;
      secretMessage : String;
}

// Public MCP projection
@mcp.resource: true
entity BooksPublic as projection on BooksInternal {
  *,
  excluding {
    costPrice,
    secretMessage
  }
};
```

**Alternative**: Use `@mcp.omit` directly on internal entity fields.

## Security Considerations

### Defense in Depth

`@mcp.omit` is one layer of security:

```cds
entity SensitiveData {
  key ID      : Integer;
      secret  : String @mcp.omit           // Layer 1: MCP privacy
                       @readonly            // Layer 2: No writes
                       @assert.format: '';  // Layer 3: CAP never returns
}

// Layer 4: CAP authorization
@restrict: [
  { grant: 'READ', to: 'Admin', where: 'createdBy = $user' }
]
```

### Audit Access

Combine with CAP audit logging:

```cds
using { temporal } from '@sap/cds/common';

entity AuditedData : temporal {
  key ID         : Integer;
      publicData : String;
      secretData : String @mcp.omit @PersonalData.IsPotentiallySensitive;
}
```

CAP tracks access even though MCP hides the field.

## Related Topics

- [Field Hints →](guide/field-hints.md) - Add descriptions with `@mcp.hint`
- [Entity Wrappers →](guide/entity-wrappers.md) - Omission in CRUD tools
- [Resources →](guide/resources.md) - Omission in resource queries
- [CAP Data Privacy](https://cap.cloud.sap/docs/guides/data-privacy/introduction) - CAP privacy features
- [CAP Authorization](https://cap.cloud.sap/docs/guides/security/authorization) - Access control
