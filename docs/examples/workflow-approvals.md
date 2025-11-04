# Workflow Approvals Example

AI-powered workflow approval system for business processes.

## Overview

This example demonstrates:
- **Approval Workflows**: Pending approvals management
- **Elicitation**: User confirmation before actions
- **Business Logic**: Approval routing and notifications
- **Authorization**: Role-based approvals

**Difficulty**: Intermediate (20-30 minutes)

**Use Case**: Enable AI agents to help users manage approval workflows through natural language.

## Scenario

A company uses approval workflows for:
- Purchase orders
- Budget requests
- Employee onboarding
- Time-off requests

Users want to ask their AI assistant:
- "Do I have any pending approvals?"
- "Approve the purchase order from Sarah"
- "Show me all budget requests over $10,000"
- "Reject the time-off request with a note"

## Data Model

```cds
namespace my.workflow;

using { cuid, managed } from '@sap/cds/common';

entity Workflows : cuid, managed {
  title          : String(200);
  description    : LargeString;
  type           : String(50);  // purchase-order, budget-request, etc.
  status         : String(20);  // pending, approved, rejected, cancelled
  submittedBy    : String(200);
  submittedDate  : DateTime;
  approver       : String(200);
  approvedDate   : DateTime;
  amount         : Decimal(15, 2);
  priority       : String(10);  // low, medium, high, urgent
  attachments    : array of String;
  comments       : Composition of many WorkflowComments on comments.workflow = $self;
}

entity WorkflowComments : cuid, managed {
  workflow : Association to Workflows;
  comment  : LargeString;
  author   : String(200);
}
```

## Service Definition

```cds
using my.workflow from '../db/schema';

@requires: 'authenticated-user'
service WorkflowService {

  // === Resources ===

  @restrict: [
    { grant: 'READ', to: 'authenticated-user', where: 'approver = $user' },
    { grant: 'READ', to: 'admin' }
  ]
  @mcp: {
    name       : 'pending-approvals',
    description: 'Workflows awaiting your approval',
    resource   : ['filter', 'orderby', 'top']
  }
  entity PendingApprovals as projection on workflow.Workflows
    where status = 'pending';

  @restrict: [
    { grant: 'READ', to: 'authenticated-user', where: 'submittedBy = $user' },
    { grant: 'READ', to: 'admin' }
  ]
  @mcp: {
    name       : 'my-submissions',
    description: 'Workflows you have submitted',
    resource   : ['filter', 'orderby', 'top']
  }
  entity MySubmissions as projection on workflow.Workflows;

  // === Approval Tools ===

  @restrict: [
    { grant: 'EXECUTE', to: 'authenticated-user' }
  ]
  @mcp: {
    name       : 'get-my-pending-approvals',
    description: 'Get all workflows awaiting your approval',
    tool       : true
  }
  function getMyPendingApprovals() returns array of {
    ID          : UUID;
    title       : String;
    type        : String;
    submittedBy : String;
    submittedDate : DateTime;
    amount      : Decimal;
    priority    : String;
  };

  @restrict: [
    { grant: 'EXECUTE', to: 'authenticated-user' }
  ]
  @mcp: {
    name       : 'approve-workflow',
    description: 'Approve a workflow',
    tool       : true,
    elicit     : ['input', 'confirm']
  }
  function approveWorkflow(
    workflowId : UUID @mcp.hint: 'ID of the workflow to approve',
    comment    : String @mcp.hint: 'Optional comment explaining approval decision'
  ) returns {
    success : Boolean;
    message : String;
  };

  @restrict: [
    { grant: 'EXECUTE', to: 'authenticated-user' }
  ]
  @mcp: {
    name       : 'reject-workflow',
    description: 'Reject a workflow',
    tool       : true,
    elicit     : ['input', 'confirm']
  }
  function rejectWorkflow(
    workflowId : UUID @mcp.hint: 'ID of the workflow to reject',
    reason     : String @mcp.hint: 'Required: Reason for rejection'
  ) returns {
    success : Boolean;
    message : String;
  };

  @mcp: {
    name       : 'get-workflow-details',
    description: 'Get detailed information about a specific workflow',
    tool       : true
  }
  function getWorkflowDetails(
    workflowId : UUID @mcp.hint: 'Workflow ID'
  ) returns {
    ID            : UUID;
    title         : String;
    description   : String;
    type          : String;
    status        : String;
    submittedBy   : String;
    submittedDate : DateTime;
    amount        : Decimal;
    priority      : String;
    comments      : array of {
      author  : String;
      comment : String;
      date    : DateTime;
    };
  };

  @mcp: {
    name       : 'summarize-approvals',
    description: 'Get summary of pending approvals by type and priority',
    tool       : true
  }
  function summarizeApprovals() returns {
    total      : Integer;
    byType     : array of { type: String; count: Integer };
    byPriority : array of { priority: String; count: Integer };
    totalAmount: Decimal;
  };
}
```

## Service Implementation

```javascript
const cds = require('@sap/cds');

module.exports = cds.service.impl(async function() {
  const { Workflows, WorkflowComments } = this.entities;

  this.on('getMyPendingApprovals', async (req) => {
    const user = req.user.id;

    const approvals = await SELECT.from(Workflows)
      .where({ status: 'pending', approver: user })
      .orderBy('priority desc', 'submittedDate');

    return approvals.map(a => ({
      ID: a.ID,
      title: a.title,
      type: a.type,
      submittedBy: a.submittedBy,
      submittedDate: a.submittedDate,
      amount: a.amount,
      priority: a.priority
    }));
  });

  this.on('approveWorkflow', async (req) => {
    const { workflowId, comment } = req.data;
    const user = req.user.id;

    // Get workflow
    const workflow = await SELECT.one.from(Workflows)
      .where({ ID: workflowId });

    if (!workflow) {
      return { success: false, message: 'Workflow not found' };
    }

    // Check authorization
    if (workflow.approver !== user) {
      return { success: false, message: 'You are not authorized to approve this workflow' };
    }

    if (workflow.status !== 'pending') {
      return { success: false, message: `Workflow is already ${workflow.status}` };
    }

    // Update workflow
    await UPDATE(Workflows)
      .set({
        status: 'approved',
        approvedDate: new Date(),
        modifiedAt: new Date(),
        modifiedBy: user
      })
      .where({ ID: workflowId });

    // Add comment if provided
    if (comment) {
      await INSERT.into(WorkflowComments).entries({
        workflow_ID: workflowId,
        comment: comment,
        author: user,
        createdAt: new Date(),
        createdBy: user
      });
    }

    // Send notification (simplified)
    console.log(`[Workflow] ${workflow.title} approved by ${user}`);

    return {
      success: true,
      message: `Workflow "${workflow.title}" has been approved`
    };
  });

  this.on('rejectWorkflow', async (req) => {
    const { workflowId, reason } = req.data;
    const user = req.user.id;

    if (!reason) {
      return { success: false, message: 'Rejection reason is required' };
    }

    // Get workflow
    const workflow = await SELECT.one.from(Workflows)
      .where({ ID: workflowId });

    if (!workflow) {
      return { success: false, message: 'Workflow not found' };
    }

    // Check authorization
    if (workflow.approver !== user) {
      return { success: false, message: 'You are not authorized to reject this workflow' };
    }

    if (workflow.status !== 'pending') {
      return { success: false, message: `Workflow is already ${workflow.status}` };
    }

    // Update workflow
    await UPDATE(Workflows)
      .set({
        status: 'rejected',
        modifiedAt: new Date(),
        modifiedBy: user
      })
      .where({ ID: workflowId });

    // Add rejection reason as comment
    await INSERT.into(WorkflowComments).entries({
      workflow_ID: workflowId,
      comment: `Rejection reason: ${reason}`,
      author: user,
      createdAt: new Date(),
      createdBy: user
    });

    // Send notification (simplified)
    console.log(`[Workflow] ${workflow.title} rejected by ${user}: ${reason}`);

    return {
      success: true,
      message: `Workflow "${workflow.title}" has been rejected`
    };
  });

  this.on('getWorkflowDetails', async (req) => {
    const { workflowId } = req.data;

    const workflow = await SELECT.one.from(Workflows)
      .where({ ID: workflowId });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    // Get comments
    const comments = await SELECT.from(WorkflowComments)
      .where({ workflow_ID: workflowId })
      .orderBy('createdAt');

    return {
      ID: workflow.ID,
      title: workflow.title,
      description: workflow.description,
      type: workflow.type,
      status: workflow.status,
      submittedBy: workflow.submittedBy,
      submittedDate: workflow.submittedDate,
      amount: workflow.amount,
      priority: workflow.priority,
      comments: comments.map(c => ({
        author: c.author,
        comment: c.comment,
        date: c.createdAt
      }))
    };
  });

  this.on('summarizeApprovals', async (req) => {
    const user = req.user.id;

    const approvals = await SELECT.from(Workflows)
      .where({ status: 'pending', approver: user });

    // Group by type
    const byType = {};
    const byPriority = {};
    let totalAmount = 0;

    for (const approval of approvals) {
      byType[approval.type] = (byType[approval.type] || 0) + 1;
      byPriority[approval.priority] = (byPriority[approval.priority] || 0) + 1;
      totalAmount += approval.amount || 0;
    }

    return {
      total: approvals.length,
      byType: Object.entries(byType).map(([type, count]) => ({ type, count })),
      byPriority: Object.entries(byPriority).map(([priority, count]) => ({ priority, count })),
      totalAmount
    };
  });
});
```

## Configuration

```json
{
  "cds": {
    "mcp": {
      "name": "workflow-approval-mcp",
      "version": "1.0.0",
      "auth": "inherit",
      "instructions": "Workflow approval system. Use 'get-my-pending-approvals' to list pending items. Use 'approve-workflow' or 'reject-workflow' with confirmation. Always provide reasons for rejections."
    },
    "requires": {
      "auth": {
        "kind": "jwt"
      }
    }
  }
}
```

## Example Interactions

### Check Pending Approvals

**User**: "Do I have any pending approvals?"

**AI Call**:
```typescript
get-my-pending-approvals()
```

**Response**:
```json
[
  {
    "ID": "abc-123",
    "title": "Purchase Order #PO-2024-001",
    "type": "purchase-order",
    "submittedBy": "sarah.johnson@company.com",
    "submittedDate": "2025-01-14T10:30:00Z",
    "amount": 12500,
    "priority": "high"
  },
  {
    "ID": "def-456",
    "title": "Budget Request - Marketing Q2",
    "type": "budget-request",
    "submittedBy": "mike.chen@company.com",
    "submittedDate": "2025-01-13T14:20:00Z",
    "amount": 45000,
    "priority": "medium"
  }
]
```

**AI Response**: "You have 2 workflows pending your approval:
1. **Purchase Order #PO-2024-001** - Submitted by Sarah Johnson, Amount: $12,500 (High priority)
2. **Budget Request - Marketing Q2** - Submitted by Mike Chen, Amount: $45,000 (Medium priority)

Would you like to review any of these?"

### Approve Workflow

**User**: "Approve the purchase order from Sarah"

**AI Workflow**:

1. **Identify workflow** (from context):
   - Workflow ID: `abc-123`

2. **Request input and confirmation** (elicitation):
   - AI asks: "Would you like to add a comment?"
   - User: "Approved - within budget"
   - AI confirms: "Approve Purchase Order #PO-2024-001 for $12,500 with comment?"
   - User: "Yes"

3. **Execute tool**:
```typescript
approve-workflow({
  workflowId: 'abc-123',
  comment: 'Approved - within budget'
})
```

**Response**:
```json
{
  "success": true,
  "message": "Workflow \"Purchase Order #PO-2024-001\" has been approved"
}
```

**AI Response**: "✓ Purchase Order #PO-2024-001 has been approved. Sarah Johnson will be notified."

### Reject with Reason

**User**: "Reject the budget request - we need more details"

**AI Workflow**:

1. **Request confirmation** (elicitation):
   - AI: "Reject Budget Request - Marketing Q2 for $45,000?"
   - User: "Yes"

2. **Execute tool**:
```typescript
reject-workflow({
  workflowId: 'def-456',
  reason: 'Need more details on campaign ROI and timeline'
})
```

**Response**:
```json
{
  "success": true,
  "message": "Workflow \"Budget Request - Marketing Q2\" has been rejected"
}
```

### Get Summary

**User**: "Give me a summary of my pending approvals"

**AI Call**:
```typescript
summarize-approvals()
```

**Response**:
```json
{
  "total": 5,
  "byType": [
    { "type": "purchase-order", "count": 2 },
    { "type": "budget-request", "count": 2 },
    { "type": "time-off", "count": 1 }
  ],
  "byPriority": [
    { "priority": "urgent", "count": 1 },
    { "priority": "high", "count": 2 },
    { "priority": "medium", "count": 2 }
  ],
  "totalAmount": 87500
}
```

**AI Response**: "You have 5 pending approvals totaling $87,500:
- **By Type**: 2 purchase orders, 2 budget requests, 1 time-off request
- **By Priority**: 1 urgent, 2 high, 2 medium

Would you like to review the urgent items first?"

### View Details

**User**: "Show me details on the urgent one"

**AI Call**:
```typescript
get-workflow-details({
  workflowId: 'urgent-workflow-id'
})
```

**Response**: Complete workflow details including comments and history

## Key Features

### Elicitation for Approvals

Both approval and rejection tools use elicitation:

```cds
@mcp: {
  name: 'approve-workflow',
  tool: true,
  elicit: ['input', 'confirm']  // Request input, then confirmation
}
```

**User Experience**:
1. AI identifies the workflow to approve
2. AI asks for optional comment (input)
3. AI asks for final confirmation
4. AI executes approval

### Authorization

Row-level security ensures users only see their approvals:

```cds
@restrict: [
  { grant: 'READ', to: 'authenticated-user', where: 'approver = $user' }
]
```

### Audit Trail

All approval actions are logged:
- Workflow status changes
- Approval/rejection comments
- Timestamps and user IDs

## Testing

### With MCP Inspector

```bash
npm run mock
npx @modelcontextprotocol/inspector
```

Test each tool:
1. List pending approvals
2. Get workflow details
3. Approve with comment
4. Reject with reason
5. View summary

### Integration with Claude Desktop

Add to Claude Desktop config:

```json
{
  "mcpServers": {
    "workflow-approvals": {
      "command": "node",
      "args": ["path/to/cds", "serve"],
      "env": {
        "PORT": "4004"
      }
    }
  }
}
```

**Usage**:
- "Show my pending approvals"
- "Approve the purchase order"
- "I need to reject the budget request"

## Business Benefits

- **Mobile Access**: Approve from anywhere via AI chat
- **Natural Language**: No need to remember workflow IDs
- **Context Awareness**: AI tracks conversation context
- **Batch Operations**: "Approve all purchase orders under $5,000"
- **Smart Filtering**: "Show urgent approvals over $10,000"
- **Audit Compliance**: All actions logged with reasons

## Extending the Example

### Add Delegation

```cds
@mcp.tool: true
function delegateApproval(
  workflowId: UUID,
  delegateTo: String
) returns { success: Boolean; message: String };
```

### Add Bulk Operations

```cds
@mcp.tool: true
function bulkApprove(
  workflowIds: array of UUID,
  comment: String
) returns { approved: Integer; failed: Integer };
```

### Add Notifications

Integrate with email/Slack:
```javascript
await sendNotification({
  to: workflow.submittedBy,
  subject: 'Workflow Approved',
  body: `Your ${workflow.type} has been approved`
});
```

## Production Checklist

- [ ] Configure JWT authentication
- [ ] Set up email notifications
- [ ] Implement audit logging
- [ ] Add workflow templates
- [ ] Configure approval routing rules
- [ ] Set up monitoring and alerts
- [ ] Test with actual users
- [ ] Document approval policies
