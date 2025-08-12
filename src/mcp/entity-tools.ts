import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpResourceAnnotation } from "../annotations/structures";
import { getAccessRights } from "../auth/utils";
import { LOGGER } from "../logger";
import { determineMcpParameterType, toolError, asMcpResult } from "./utils";

/**
 * Resolve the CAP runtime instance from the host app.
 * We intentionally do not import @sap/cds here to avoid creating a second instance.
 */
function getCds(): any {
  return (global as any).cds;
}

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
): Promise<any | undefined> {
  const CDS = getCds();
  // Direct lookup (both exact and lowercase variants)
  let svc =
    CDS.services?.[serviceName] || CDS.services?.[serviceName.toLowerCase()];
  if (svc) return svc;

  // Look through known service providers
  const providers: any[] =
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
    if (found) return found;
  }

  // Last resort: connect by name
  // Do not attempt to require/connect another cds instance; rely on app runtime only

  return undefined;
}

// NOTE: We use plain entity names (service projection) for queries.

const MAX_TOP = 200;
const TIMEOUT_MS = 10_000; // Standard timeout for tool calls (ms)

/**
 * Registers CRUD-like MCP tools for an annotated entity (resource).
 * Modes can be controlled globally via configuration and per-entity via @mcp.wrap.
 *
 * Example tool names (naming is explicit for easier LLM usage):
 *   Service_Entity_query, Service_Entity_get, Service_Entity_create, Service_Entity_update
 */
export function registerEntityWrappers(
  resAnno: McpResourceAnnotation,
  server: McpServer,
  authEnabled: boolean,
  defaultModes: ("query" | "get" | "create" | "update" | "delete")[],
): void {
  const CDS = getCds();
  LOGGER.debug(
    `[REGISTRATION TIME] Registering entity wrappers for ${resAnno.serviceName}.${resAnno.target}, available services:`,
    Object.keys(CDS.services || {}),
  );
  const modes = resAnno.wrap?.modes ?? defaultModes;

  if (modes.includes("query")) {
    registerQueryTool(resAnno, server, authEnabled);
  }
  if (
    modes.includes("get") &&
    resAnno.resourceKeys &&
    resAnno.resourceKeys.size > 0
  ) {
    registerGetTool(resAnno, server, authEnabled);
  }
  if (modes.includes("create")) {
    registerCreateTool(resAnno, server, authEnabled);
  }
  if (
    modes.includes("update") &&
    resAnno.resourceKeys &&
    resAnno.resourceKeys.size > 0
  ) {
    registerUpdateTool(resAnno, server, authEnabled);
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
  suffix: "query" | "get" | "create" | "update",
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
  const propKeys = Array.from(resAnno.properties.keys());
  const fieldEnum = (propKeys.length
    ? z.enum(propKeys as [string, ...string[]])
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
      select: z.array(fieldEnum).optional(),
      orderby: z
        .array(
          z.object({
            field: fieldEnum,
            dir: z.enum(["asc", "desc"]).default("asc"),
          }),
        )
        .optional(),
      where: z
        .array(
          z.object({
            field: fieldEnum,
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
        .optional(),
      q: z.string().optional().describe("Quick text search"),
      return: z.enum(["rows", "count", "aggregate"]).default("rows").optional(),
      aggregate: z
        .array(
          z.object({
            field: fieldEnum,
            fn: z.enum(["sum", "avg", "min", "max", "count"]),
          }),
        )
        .optional(),
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
  const desc = `List ${resAnno.target}. Use structured filters (where), top/skip/orderby/select. For fields & examples call cap_describe_model.${hint}`;

  const queryHandler = async (rawArgs: Record<string, unknown>) => {
    const parsed = inputZod.safeParse(rawArgs);
    if (!parsed.success) {
      return toolError("INVALID_INPUT", "Query arguments failed validation", {
        issues: parsed.error.issues,
      });
    }
    const args = parsed.data;
    const CDS = getCds();
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

    let q: any;
    try {
      q = buildQuery(CDS, args, resAnno, propKeys);
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
    const CDS = getCds();
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
        svc.read(resAnno.target, keys),
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
    const CDS = getCds();
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
    const CDS = getCds();
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

// Helper: compile structured inputs into a CDS query
// The function translates the validated MCP input into CQN safely,
// including a basic escape of string literals to avoid invalid syntax.
function buildQuery(
  CDS: any,
  args: any,
  resAnno: McpResourceAnnotation,
  propKeys?: string[],
): any {
  const { SELECT } = CDS.ql;
  const limitTop = args.top ?? 25;
  const limitSkip = args.skip ?? 0;
  let qy: any = SELECT.from(resAnno.target).limit(limitTop, limitSkip);
  if ((propKeys?.length ?? 0) === 0) return qy;

  if (args.select?.length) qy = qy.columns(...args.select);

  if (args.orderby?.length) {
    // Map to CQN-compatible order by fragments
    const orderFragments = args.orderby.map((o: any) => `${o.field} ${o.dir}`);
    qy = qy.orderBy(orderFragments);
  }

  if ((typeof args.q === "string" && args.q.length > 0) || args.where?.length) {
    const ands: any[] = [];

    if (args.q) {
      const textFields = Array.from(resAnno.properties.keys()).filter((k) =>
        /string/i.test(String(resAnno.properties.get(k))),
      );
      const ors = textFields.map((f) =>
        CDS.parse.expr(
          `contains(${f}, '${String(args.q).replace(/'/g, "''")}')`,
        ),
      );
      if (ors.length)
        ands.push(CDS.parse.expr(ors.map((x) => `(${x})`).join(" or ")));
    }

    for (const c of args.where || []) {
      const { field, op, value } = c;
      if (op === "in" && Array.isArray(value)) {
        const list = value
          .map((v) =>
            typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v),
          )
          .join(",");
        ands.push(CDS.parse.expr(`${field} in (${list})`));
        continue;
      }
      const lit =
        typeof value === "string"
          ? `'${String(value).replace(/'/g, "''")}'`
          : String(value);
      const expr = ["contains", "startswith", "endswith"].includes(op)
        ? `${op}(${field}, ${lit})`
        : `${field} ${op} ${lit}`;
      ands.push(CDS.parse.expr(expr));
    }

    if (ands.length) qy = qy.where(ands);
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
  svc: any,
  args: any,
  baseQuery: any,
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
