import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpResourceAnnotation } from "../annotations/structures";
import { getAccessRights, WrapAccess } from "../auth/utils";
import { LOGGER } from "../logger";
import { determineMcpParameterType, toolError, asMcpResult } from "./utils";
import { EntityOperationMode, EntityListQueryArgs } from "./types";
import type { ql, Service } from "@sap/cds";

/**
 * Wraps a promise with a timeout to avoid indefinite hangs in MCP tool calls.
 * Ensures we always either resolve within the expected time or fail gracefully.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  onTimeout?: () => Promise<void> | void,
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(async () => {
          try {
            await onTimeout?.();
          } catch {}
          reject(new Error(`${label} timed out after ${ms}ms`));
        }, ms);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Attempts to find a running CAP service instance for the given service name.
 * - Checks the in-memory services registry first
 * - Falls back to known service providers (when available)
 * Note: We deliberately avoid creating new connections here to not duplicate contexts.
 */
async function resolveServiceInstance(
  serviceName: string,
): Promise<Service | undefined> {
  const CDS = (global as any).cds;
  // Direct lookup (both exact and lowercase variants)
  let svc: Service | undefined =
    CDS.services?.[serviceName] || CDS.services?.[serviceName.toLowerCase()];
  if (svc) return svc;

  // Look through known service providers
  const providers: unknown[] =
    (CDS.service && (CDS.service as any).providers) ||
    (CDS.services && (CDS.services as any).providers) ||
    [];
  if (Array.isArray(providers)) {
    const found = providers.find(
      (p: any) =>
        p?.definition?.name === serviceName ||
        p?.name === serviceName ||
        (typeof p?.path === "string" &&
          p.path.includes(serviceName.toLowerCase())),
    );
    if (found) return found as Service;
  }

  // Last resort: connect by name
  // Do not attempt to require/connect another cds instance; rely on app runtime only

  return undefined;
}

// NOTE: We use plain entity names (service projection) for queries.

const MAX_TOP = 200;
const TIMEOUT_MS = 10_000; // Standard timeout for tool calls (ms)

/**
 * Builds enhanced query tool description with field types and association examples
 * to help LLMs understand how to construct proper query parameters.
 */
function buildEnhancedQueryDescription(resAnno: McpResourceAnnotation): string {
  // Build field descriptions with types and association hints
  const fieldDescriptions: string[] = [];
  const associationExamples: string[] = [];

  for (const [propName, cdsType] of resAnno.properties.entries()) {
    const isAssociation = String(cdsType).toLowerCase().includes("association");
    if (isAssociation) {
      const fieldName = `${propName}`;
      fieldDescriptions.push(
        `${fieldName}(association: compare by key value e.g. ID)`,
      );
      associationExamples.push(`{field:'${fieldName}',op:'eq',value:1}`);
    } else {
      const jsType = determineMcpParameterType(cdsType);
      const typeStr =
        typeof jsType === "object" && jsType !== null && "type" in jsType
          ? (jsType as any).type
          : "unknown";
      fieldDescriptions.push(`${propName}(${typeStr})`);
    }
  }

  const fieldList = fieldDescriptions.join(", ");
  const exampleText =
    associationExamples.length > 0
      ? ` Association examples: ${associationExamples.join(", ")}`
      : "";

  return `Query ${resAnno.target}. Fields: ${fieldList}.${exampleText} Use structured where clauses with field names exactly as listed.`;
}

/**
 * Builds field documentation for schema descriptions
 */
function buildFieldDocumentation(resAnno: McpResourceAnnotation): string {
  const docs: string[] = [];
  for (const [propName, cdsType] of resAnno.properties.entries()) {
    const isAssociation = String(cdsType).toLowerCase().includes("association");
    if (isAssociation) {
      docs.push(`${propName}(association: compare by key value)`);
      docs.push(`${propName}_ID(foreign key for ${propName})`);
    } else {
      docs.push(`${propName}(${String(cdsType).toLowerCase()})`);
    }
  }
  return docs.join(", ");
}

/**
 * Registers CRUD-like MCP tools for an annotated entity (resource).
 * Modes can be controlled globally via configuration and per-entity via @mcp.wrap.
 *
 * Example tool names (naming is explicit for easier LLM usage):
 *   Service_Entity_query, Service_Entity_get, Service_Entity_create, Service_Entity_update, Service_Entity_delete
 */
export function registerEntityWrappers(
  resAnno: McpResourceAnnotation,
  server: McpServer,
  authEnabled: boolean,
  defaultModes: EntityOperationMode[],
  accesses: WrapAccess,
): void {
  const CDS = (global as any).cds;
  LOGGER.debug(
    `[REGISTRATION TIME] Registering entity wrappers for ${resAnno.serviceName}.${resAnno.target}, available services:`,
    Object.keys(CDS.services || {}),
  );
  const modes = resAnno.wrap?.modes ?? defaultModes;

  if (modes.includes("query") && accesses.canRead) {
    registerQueryTool(resAnno, server, authEnabled);
  }
  if (
    modes.includes("get") &&
    resAnno.resourceKeys &&
    resAnno.resourceKeys.size > 0 &&
    accesses.canRead
  ) {
    registerGetTool(resAnno, server, authEnabled);
  }
  if (modes.includes("create") && accesses.canCreate) {
    registerCreateTool(resAnno, server, authEnabled);
  }
  if (
    modes.includes("update") &&
    resAnno.resourceKeys &&
    resAnno.resourceKeys.size > 0 &&
    accesses.canUpdate
  ) {
    registerUpdateTool(resAnno, server, authEnabled);
  }
  if (
    modes.includes("delete") &&
    resAnno.resourceKeys &&
    resAnno.resourceKeys.size > 0 &&
    accesses.canDelete
  ) {
    registerDeleteTool(resAnno, server, authEnabled);
  }
}

/**
 * Builds the visible tool name for a given operation mode.
 * We prefer a descriptive naming scheme that is easy for humans and LLMs:
 *   Service_Entity_mode
 */
function nameFor(
  service: string,
  entity: string,
  suffix: EntityOperationMode,
): string {
  // Use explicit Service_Entity_suffix naming to match docs/tests
  const entityName = entity.split(".").pop()!; // keep original case
  const serviceName = service.split(".").pop()!; // keep original case
  return `${serviceName}_${entityName}_${suffix}`;
}

/**
 * Registers the list/query tool for an entity.
 * Supports select/where/orderby/top/skip and simple text search (q).
 */
function registerQueryTool(
  resAnno: McpResourceAnnotation,
  server: McpServer,
  authEnabled: boolean,
): void {
  const toolName = nameFor(resAnno.serviceName, resAnno.target, "query");

  // Structured input schema for queries with guard for empty property lists
  const allKeys = Array.from(resAnno.properties.keys());
  const scalarKeys = Array.from(resAnno.properties.entries())
    .filter(
      ([, cdsType]) => !String(cdsType).toLowerCase().includes("association"),
    )
    .map(([name]) => name);

  // Add foreign key fields for associations to scalar keys for select/orderby
  for (const [propName, cdsType] of resAnno.properties.entries()) {
    const isAssociation = String(cdsType).toLowerCase().includes("association");
    if (isAssociation) {
      scalarKeys.push(`${propName}_ID`);
    }
  }

  // Build where field enum: include all fields plus foreign key fields for associations
  const whereKeys = [...allKeys];
  for (const [propName, cdsType] of resAnno.properties.entries()) {
    const isAssociation = String(cdsType).toLowerCase().includes("association");
    if (isAssociation) {
      whereKeys.push(`${propName}_ID`);
    }
  }

  const whereFieldEnum = (whereKeys.length
    ? z.enum(whereKeys as [string, ...string[]])
    : z
        .enum(["__dummy__"])
        .transform(() => "__dummy__")) as unknown as z.ZodEnum<
    [string, ...string[]]
  >;
  const selectFieldEnum = (scalarKeys.length
    ? z.enum(scalarKeys as [string, ...string[]])
    : z
        .enum(["__dummy__"])
        .transform(() => "__dummy__")) as unknown as z.ZodEnum<
    [string, ...string[]]
  >;
  const inputZod = z
    .object({
      top: z
        .number()
        .int()
        .min(1)
        .max(MAX_TOP)
        .default(25)
        .describe("Rows (default 25)"),
      skip: z.number().int().min(0).default(0).describe("Offset"),
      select: z
        .array(selectFieldEnum)
        .optional()
        .transform((val: string[] | undefined) =>
          val && val.length > 0 ? val : undefined,
        )
        .describe(
          `Select/orderby allow only scalar fields: ${scalarKeys.join(", ")}`,
        ),
      orderby: z
        .array(
          z.object({
            field: selectFieldEnum,
            dir: z.enum(["asc", "desc"]).default("asc"),
          }),
        )
        .optional()
        .transform(
          (val: { field: string; dir: "asc" | "desc" }[] | undefined) =>
            val && val.length > 0 ? val : undefined,
        ),
      where: z
        .array(
          z.object({
            field: whereFieldEnum.describe(
              `Filterable fields: ${buildFieldDocumentation(resAnno)} (associations compare by key value)`,
            ),
            op: z.enum([
              "eq",
              "ne",
              "gt",
              "ge",
              "lt",
              "le",
              "contains",
              "startswith",
              "endswith",
              "in",
            ]),
            value: z.union([
              z.string(),
              z.number(),
              z.boolean(),
              z.array(z.union([z.string(), z.number()])),
            ]),
          }),
        )
        .optional()
        .transform((val: any[] | undefined) =>
          val && val.length > 0 ? val : undefined,
        ),
      q: z.string().optional().describe("Quick text search"),
      return: z.enum(["rows", "count", "aggregate"]).default("rows").optional(),
      aggregate: z
        .array(
          z.object({
            field: selectFieldEnum,
            fn: z.enum(["sum", "avg", "min", "max", "count"]),
          }),
        )
        .optional()
        .transform(
          (
            val:
              | { field: string; fn: "sum" | "avg" | "min" | "max" | "count" }[]
              | undefined,
          ) => (val && val.length > 0 ? val : undefined),
        ),
      explain: z.boolean().optional(),
    })
    .strict();
  const inputSchema: Record<string, z.ZodType> = {
    top: inputZod.shape.top,
    skip: inputZod.shape.skip,
    select: inputZod.shape.select,
    orderby: inputZod.shape.orderby,
    where: inputZod.shape.where,
    q: inputZod.shape.q,
    return: inputZod.shape.return,
    aggregate: inputZod.shape.aggregate,
    explain: inputZod.shape.explain,
  } as unknown as Record<string, z.ZodType>;

  const hint = resAnno.wrap?.hint ? ` Hint: ${resAnno.wrap?.hint}` : "";
  const desc =
    `${buildEnhancedQueryDescription(resAnno)} Note: select/orderby only support scalar fields. To filter by association, use the association field name with the key value (e.g., {field:'author',op:'eq',value:4}).` +
    hint;

  const queryHandler = async (rawArgs: Record<string, unknown>) => {
    const parsed = inputZod.safeParse(rawArgs);
    if (!parsed.success) {
      return toolError("INVALID_INPUT", "Query arguments failed validation", {
        issues: parsed.error.issues,
      });
    }
    const args = parsed.data as EntityListQueryArgs;
    const CDS = (global as any).cds;
    LOGGER.debug(
      `[EXECUTION TIME] Query tool: Looking for service: ${resAnno.serviceName}, available services:`,
      Object.keys(CDS.services || {}),
    );
    const svc = await resolveServiceInstance(resAnno.serviceName);

    if (!svc) {
      const msg = `Service not found: ${resAnno.serviceName}. Available: ${Object.keys(CDS.services || {}).join(", ")}`;
      LOGGER.error(msg);
      return toolError("ERR_MISSING_SERVICE", msg);
    }

    let q: ql.SELECT<any>;
    try {
      q = buildQuery(CDS, args, resAnno, allKeys);
    } catch (e: any) {
      return toolError("FILTER_PARSE_ERROR", e?.message || String(e));
    }

    try {
      const t0 = Date.now();
      const response = await withTimeout(
        executeQuery(CDS, svc, args, q),
        TIMEOUT_MS,
        toolName,
      );
      LOGGER.debug(
        `[EXECUTION TIME] Query tool completed: ${toolName} in ${Date.now() - t0}ms`,
        { resultKind: args.return ?? "rows" },
      );
      return asMcpResult(
        args.explain ? { data: response, plan: undefined } : response,
      );
    } catch (error: any) {
      const msg = `QUERY_FAILED: ${error?.message || String(error)}`;
      LOGGER.error(msg, error);
      return toolError("QUERY_FAILED", msg);
    }
  };

  server.registerTool(
    toolName,
    { title: toolName, description: desc, inputSchema },
    queryHandler as any,
  );
}

/**
 * Registers the get-by-keys tool for an entity.
 * Accepts keys either as an object or shorthand (single-key) value.
 */
function registerGetTool(
  resAnno: McpResourceAnnotation,
  server: McpServer,
  authEnabled: boolean,
): void {
  const toolName = nameFor(resAnno.serviceName, resAnno.target, "get");
  const inputSchema: Record<string, z.ZodType> = {};
  for (const [k, cdsType] of resAnno.resourceKeys.entries()) {
    inputSchema[k] = (determineMcpParameterType(cdsType) as z.ZodType).describe(
      `Key ${k}`,
    );
  }

  const keyList = Array.from(resAnno.resourceKeys.keys()).join(", ");
  const hint = resAnno.wrap?.hint ? ` Hint: ${resAnno.wrap?.hint}` : "";
  const desc = `Get one ${resAnno.target} by key(s): ${keyList}. For fields & examples call cap_describe_model.${hint}`;

  const getHandler = async (args: Record<string, unknown>) => {
    const startTime = Date.now();
    const CDS = (global as any).cds;
    LOGGER.debug(`[EXECUTION TIME] Get tool invoked: ${toolName}`, { args });

    const svc = await resolveServiceInstance(resAnno.serviceName);
    if (!svc) {
      const msg = `Service not found: ${resAnno.serviceName}. Available: ${Object.keys(CDS.services || {}).join(", ")}`;
      LOGGER.error(msg);
      return toolError("ERR_MISSING_SERVICE", msg);
    }

    // Normalize single-key shorthand, case-insensitive keys, and value-only payloads
    let normalizedArgs: any = args as any;
    if (resAnno.resourceKeys.size === 1) {
      const onlyKey = Array.from(resAnno.resourceKeys.keys())[0];
      if (
        normalizedArgs == null ||
        typeof normalizedArgs !== "object" ||
        Array.isArray(normalizedArgs)
      ) {
        normalizedArgs = { [onlyKey]: normalizedArgs };
      } else if (
        normalizedArgs[onlyKey] === undefined &&
        normalizedArgs.value !== undefined
      ) {
        normalizedArgs[onlyKey] = normalizedArgs.value;
      } else if (normalizedArgs[onlyKey] === undefined) {
        const alt = Object.entries(normalizedArgs).find(
          ([kk]) => String(kk).toLowerCase() === String(onlyKey).toLowerCase(),
        );
        if (alt) normalizedArgs[onlyKey] = (normalizedArgs as any)[alt[0]];
      }
    }

    const keys: Record<string, unknown> = {};
    for (const [k] of resAnno.resourceKeys.entries()) {
      let provided = (normalizedArgs as any)[k];
      if (provided === undefined) {
        const alt = Object.entries(normalizedArgs || {}).find(
          ([kk]) => String(kk).toLowerCase() === String(k).toLowerCase(),
        );
        if (alt) provided = (normalizedArgs as any)[alt[0]];
      }
      if (provided === undefined) {
        LOGGER.warn(`Get tool missing required key`, { key: k, toolName });
        return toolError("MISSING_KEY", `Missing key '${k}'`);
      }
      const raw = provided;
      keys[k] =
        typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : raw;
    }

    LOGGER.debug(`Executing READ on ${resAnno.target} with keys`, keys);

    try {
      const response = await withTimeout(
        svc.run(svc.read(resAnno.target, keys)),
        TIMEOUT_MS,
        `${toolName}`,
      );

      LOGGER.debug(
        `[EXECUTION TIME] Get tool completed: ${toolName} in ${Date.now() - startTime}ms`,
        { found: !!response },
      );

      return asMcpResult(response ?? null);
    } catch (error: any) {
      const msg = `GET_FAILED: ${error?.message || String(error)}`;
      LOGGER.error(msg, error);
      return toolError("GET_FAILED", msg);
    }
  };

  server.registerTool(
    toolName,
    { title: toolName, description: desc, inputSchema },
    getHandler as any,
  );
}

/**
 * Registers the create tool for an entity.
 * Associations are exposed via <assoc>_ID fields for simplicity.
 */
function registerCreateTool(
  resAnno: McpResourceAnnotation,
  server: McpServer,
  authEnabled: boolean,
): void {
  const toolName = nameFor(resAnno.serviceName, resAnno.target, "create");

  const inputSchema: Record<string, z.ZodType> = {};
  for (const [propName, cdsType] of resAnno.properties.entries()) {
    const isAssociation = String(cdsType).toLowerCase().includes("association");
    if (isAssociation) {
      // Prefer foreign key input for associations: <assoc>_ID
      inputSchema[`${propName}_ID`] = z
        .number()
        .describe(`Foreign key for association ${propName}`)
        .optional();
      continue;
    }
    inputSchema[propName] = (determineMcpParameterType(cdsType) as z.ZodType)
      .optional()
      .describe(`Field ${propName}`);
  }

  const hint = resAnno.wrap?.hint ? ` Hint: ${resAnno.wrap?.hint}` : "";
  const desc = `Create a new ${resAnno.target}. Provide fields; service applies defaults.${hint}`;

  const createHandler = async (args: Record<string, unknown>) => {
    const CDS = (global as any).cds;
    const { INSERT } = CDS.ql;
    const svc = await resolveServiceInstance(resAnno.serviceName);
    if (!svc) {
      const msg = `Service not found: ${resAnno.serviceName}. Available: ${Object.keys(CDS.services || {}).join(", ")}`;
      LOGGER.error(msg);
      return toolError("ERR_MISSING_SERVICE", msg);
    }

    // Build data object from provided args, limited to known properties
    // Normalize payload: prefer *_ID for associations and coerce numeric strings
    const data: Record<string, unknown> = {};
    for (const [propName, cdsType] of resAnno.properties.entries()) {
      const isAssociation = String(cdsType)
        .toLowerCase()
        .includes("association");
      if (isAssociation) {
        const fkName = `${propName}_ID`;
        if (args[fkName] !== undefined) {
          const val = (args as any)[fkName];
          data[fkName] =
            typeof val === "string" && /^\d+$/.test(val) ? Number(val) : val;
        }
        continue;
      }
      if (args[propName] !== undefined) {
        const val = (args as any)[propName];
        data[propName] =
          typeof val === "string" && /^\d+$/.test(val) ? Number(val) : val;
      }
    }

    const tx = svc.tx({ user: getAccessRights(authEnabled) });
    try {
      const response = await withTimeout(
        tx.run(INSERT.into(resAnno.target).entries(data)),
        TIMEOUT_MS,
        toolName,
        async () => {
          try {
            await tx.rollback();
          } catch {}
        },
      );
      try {
        await tx.commit();
      } catch {}
      return asMcpResult(response ?? {});
    } catch (error: any) {
      try {
        await tx.rollback();
      } catch {}
      const isTimeout = String(error?.message || "").includes("timed out");
      const msg = isTimeout
        ? `${toolName} timed out after ${TIMEOUT_MS}ms`
        : `CREATE_FAILED: ${error?.message || String(error)}`;
      LOGGER.error(msg, error);
      return toolError(isTimeout ? "TIMEOUT" : "CREATE_FAILED", msg);
    }
  };

  server.registerTool(
    toolName,
    { title: toolName, description: desc, inputSchema },
    createHandler as any,
  );
}

/**
 * Registers the update tool for an entity.
 * Keys are required; non-key fields are optional. Associations via <assoc>_ID.
 */
function registerUpdateTool(
  resAnno: McpResourceAnnotation,
  server: McpServer,
  authEnabled: boolean,
): void {
  const toolName = nameFor(resAnno.serviceName, resAnno.target, "update");

  const inputSchema: Record<string, z.ZodType> = {};
  // Keys required
  for (const [k, cdsType] of resAnno.resourceKeys.entries()) {
    inputSchema[k] = (determineMcpParameterType(cdsType) as z.ZodType).describe(
      `Key ${k}`,
    );
  }
  // Other fields optional
  for (const [propName, cdsType] of resAnno.properties.entries()) {
    if (resAnno.resourceKeys.has(propName)) continue;
    const isAssociation = String(cdsType).toLowerCase().includes("association");
    if (isAssociation) {
      inputSchema[`${propName}_ID`] = z
        .number()
        .describe(`Foreign key for association ${propName}`)
        .optional();
      continue;
    }
    inputSchema[propName] = (determineMcpParameterType(cdsType) as z.ZodType)
      .optional()
      .describe(`Field ${propName}`);
  }

  const keyList = Array.from(resAnno.resourceKeys.keys()).join(", ");
  const hint = resAnno.wrap?.hint ? ` Hint: ${resAnno.wrap?.hint}` : "";
  const desc = `Update ${resAnno.target} by key(s): ${keyList}. Provide fields to update.${hint}`;

  const updateHandler = async (args: Record<string, unknown>) => {
    const CDS = (global as any).cds;
    const { UPDATE } = CDS.ql;
    const svc = await resolveServiceInstance(resAnno.serviceName);
    if (!svc) {
      const msg = `Service not found: ${resAnno.serviceName}. Available: ${Object.keys(CDS.services || {}).join(", ")}`;
      LOGGER.error(msg);
      return toolError("ERR_MISSING_SERVICE", msg);
    }

    // Extract keys and update fields
    const keys: Record<string, unknown> = {};
    for (const [k] of resAnno.resourceKeys.entries()) {
      if (args[k] === undefined) {
        return {
          isError: true,
          content: [{ type: "text", text: `Missing key '${k}'` }],
        };
      }
      keys[k] = args[k];
    }

    // Normalize updates: prefer *_ID for associations and coerce numeric strings
    const updates: Record<string, unknown> = {};
    for (const [propName, cdsType] of resAnno.properties.entries()) {
      if (resAnno.resourceKeys.has(propName)) continue;
      const isAssociation = String(cdsType)
        .toLowerCase()
        .includes("association");
      if (isAssociation) {
        const fkName = `${propName}_ID`;
        if (args[fkName] !== undefined) {
          const val = (args as any)[fkName];
          updates[fkName] =
            typeof val === "string" && /^\d+$/.test(val) ? Number(val) : val;
        }
        continue;
      }
      if (args[propName] !== undefined) {
        const val = (args as any)[propName];
        updates[propName] =
          typeof val === "string" && /^\d+$/.test(val) ? Number(val) : val;
      }
    }
    if (Object.keys(updates).length === 0) {
      return toolError("NO_FIELDS", "No fields provided to update");
    }

    const tx = svc.tx({ user: getAccessRights(authEnabled) });
    try {
      const response = await withTimeout(
        tx.run(UPDATE(resAnno.target).set(updates).where(keys)),
        TIMEOUT_MS,
        toolName,
        async () => {
          try {
            await tx.rollback();
          } catch {}
        },
      );

      try {
        await tx.commit();
      } catch {}

      return asMcpResult(response ?? {});
    } catch (error: any) {
      try {
        await tx.rollback();
      } catch {}
      const isTimeout = String(error?.message || "").includes("timed out");
      const msg = isTimeout
        ? `${toolName} timed out after ${TIMEOUT_MS}ms`
        : `UPDATE_FAILED: ${error?.message || String(error)}`;
      LOGGER.error(msg, error);
      return toolError(isTimeout ? "TIMEOUT" : "UPDATE_FAILED", msg);
    }
  };

  server.registerTool(
    toolName,
    { title: toolName, description: desc, inputSchema },
    updateHandler as any,
  );
}

/**
 * Registers the delete tool for an entity.
 * Requires keys to identify the entity to delete.
 */
function registerDeleteTool(
  resAnno: McpResourceAnnotation,
  server: McpServer,
  authEnabled: boolean,
): void {
  const toolName = nameFor(resAnno.serviceName, resAnno.target, "delete");

  const inputSchema: Record<string, z.ZodType> = {};
  // Keys required for deletion
  for (const [k, cdsType] of resAnno.resourceKeys.entries()) {
    inputSchema[k] = (determineMcpParameterType(cdsType) as z.ZodType).describe(
      `Key ${k}`,
    );
  }

  const keyList = Array.from(resAnno.resourceKeys.keys()).join(", ");
  const hint = resAnno.wrap?.hint ? ` Hint: ${resAnno.wrap?.hint}` : "";
  const desc = `Delete ${resAnno.target} by key(s): ${keyList}. This operation cannot be undone.${hint}`;

  const deleteHandler = async (args: Record<string, unknown>) => {
    const CDS = (global as any).cds;
    const { DELETE } = CDS.ql;
    const svc = await resolveServiceInstance(resAnno.serviceName);
    if (!svc) {
      const msg = `Service not found: ${resAnno.serviceName}. Available: ${Object.keys(CDS.services || {}).join(", ")}`;
      LOGGER.error(msg);
      return toolError("ERR_MISSING_SERVICE", msg);
    }

    // Extract keys - similar to get/update handlers
    const keys: Record<string, unknown> = {};
    for (const [k] of resAnno.resourceKeys.entries()) {
      let provided = (args as any)[k];
      if (provided === undefined) {
        // Case-insensitive key matching (like in get handler)
        const alt = Object.entries(args || {}).find(
          ([kk]) => String(kk).toLowerCase() === String(k).toLowerCase(),
        );
        if (alt) provided = (args as any)[alt[0]];
      }
      if (provided === undefined) {
        LOGGER.warn(`Delete tool missing required key`, { key: k, toolName });
        return toolError("MISSING_KEY", `Missing key '${k}'`);
      }
      // Coerce numeric strings (like in get handler)
      const raw = provided;
      keys[k] =
        typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : raw;
    }

    LOGGER.debug(`Executing DELETE on ${resAnno.target} with keys`, keys);

    const tx = svc.tx({ user: getAccessRights(authEnabled) });
    try {
      const response = await withTimeout(
        tx.run(DELETE.from(resAnno.target).where(keys)),
        TIMEOUT_MS,
        toolName,
        async () => {
          try {
            await tx.rollback();
          } catch {}
        },
      );

      try {
        await tx.commit();
      } catch {}

      return asMcpResult(response ?? { deleted: true });
    } catch (error: any) {
      try {
        await tx.rollback();
      } catch {}
      const isTimeout = String(error?.message || "").includes("timed out");
      const msg = isTimeout
        ? `${toolName} timed out after ${TIMEOUT_MS}ms`
        : `DELETE_FAILED: ${error?.message || String(error)}`;
      LOGGER.error(msg, error);
      return toolError(isTimeout ? "TIMEOUT" : "DELETE_FAILED", msg);
    }
  };

  server.registerTool(
    toolName,
    { title: toolName, description: desc, inputSchema },
    deleteHandler as any,
  );
}

// Helper: compile structured inputs into a CDS query
// The function translates the validated MCP input into CQN safely,
// including a basic escape of string literals to avoid invalid syntax.
function buildQuery(
  CDS: any,
  args: EntityListQueryArgs,
  resAnno: McpResourceAnnotation,
  propKeys?: string[],
): ql.SELECT<any> {
  const { SELECT } = CDS.ql;
  const limitTop = args.top ?? 25;
  const limitSkip = args.skip ?? 0;
  let qy: ql.SELECT<any> = SELECT.from(resAnno.target).limit(
    limitTop,
    limitSkip,
  );
  if ((propKeys?.length ?? 0) === 0) return qy;

  if (args.select?.length) {
    qy = qy.columns(...args.select);
  }

  if (args.orderby?.length) {
    // Map to CQN-compatible order by fragments
    const orderFragments = args.orderby.map((o: any) => `${o.field} ${o.dir}`);
    qy = qy.orderBy(...orderFragments);
  }

  if ((typeof args.q === "string" && args.q.length > 0) || args.where?.length) {
    const ands: any[] = [];

    if (args.q) {
      const textFields = Array.from(resAnno.properties.keys()).filter((k) =>
        /string/i.test(String(resAnno.properties.get(k))),
      );
      const escaped = String(args.q).replace(/'/g, "''");
      const ors = textFields.map((f) => `contains(${f}, '${escaped}')`);
      if (ors.length) {
        const orExpr = ors.map((x) => `(${x})`).join(" or ");
        ands.push(CDS.parse.expr(orExpr));
      }
    }

    for (const c of args.where || []) {
      const { field, op, value } = c;

      // Handle association field comparisons by converting to proper CDS syntax
      let actualField = field;
      const isAssociationField =
        resAnno.properties.has(field) &&
        String(resAnno.properties.get(field))
          .toLowerCase()
          .includes("association");

      if (isAssociationField) {
        // For association fields, convert to foreign key field name
        actualField = `${field}_ID`;
      }

      if (op === "in" && Array.isArray(value)) {
        const list = value
          .map((v) =>
            typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v),
          )
          .join(",");
        ands.push(CDS.parse.expr(`${actualField} in (${list})`));
        continue;
      }
      const lit =
        typeof value === "string"
          ? `'${String(value).replace(/'/g, "''")}'`
          : String(value);

      // Map OData operators to CDS/SQL operators
      const cdsOp =
        op === "eq"
          ? "="
          : op === "ne"
            ? "!="
            : op === "gt"
              ? ">"
              : op === "ge"
                ? ">="
                : op === "lt"
                  ? "<"
                  : op === "le"
                    ? "<="
                    : op;

      const expr = ["contains", "startswith", "endswith"].includes(op)
        ? `${op}(${actualField}, ${lit})`
        : `${actualField} ${cdsOp} ${lit}`;
      ands.push(CDS.parse.expr(expr));
    }

    if (ands.length) {
      // Apply each condition individually - CDS will AND them together
      for (const condition of ands) {
        qy = qy.where(condition);
      }
    }
  }

  return qy;
}

// Helper: execute query supporting return=count/aggregate
// Supports three modes:
// - rows (default): returns the selected rows
// - count: returns { count: number }
// - aggregate: returns aggregation result rows based on provided definitions
async function executeQuery(
  CDS: any,
  svc: Service,
  args: EntityListQueryArgs,
  baseQuery: ql.SELECT<any>,
): Promise<any> {
  const { SELECT } = CDS.ql;
  switch (args.return) {
    case "count": {
      const countQuery = SELECT.from(baseQuery.SELECT.from).columns(
        "count(1) as count",
      );
      const result = await svc.run(countQuery);
      const row = Array.isArray(result) ? result[0] : result;
      return { count: row?.count ?? 0 };
    }
    case "aggregate": {
      if (!args.aggregate?.length) return [];
      const cols = args.aggregate.map(
        (a: any) => `${a.fn}(${a.field}) as ${a.fn}_${a.field}`,
      );
      const aggQuery = SELECT.from(baseQuery.SELECT.from).columns(...cols);
      return svc.run(aggQuery);
    }
    default:
      return svc.run(baseQuery);
  }
}
