import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpResourceAnnotation } from "../annotations/structures";
import { getAccessRights, WrapAccess } from "../auth/utils";
import { LOGGER } from "../logger";
import {
  determineMcpParameterType,
  buildDeepInsertZodType,
  toolError,
  asMcpResult,
  applyOmissionFilter,
} from "./utils";
import { EntityOperationMode, EntityListQueryArgs } from "./types";
import type { csn, ql, Service } from "@sap/cds";
import cds from "@sap/cds";

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
 * CDS integer types whose values can be safely represented as a JavaScript `Number`
 * without risk of precision loss: `Integer`, `Int16`, `Int32`, `UInt8`.
 *
 * All values of these types are guaranteed to fit within `Number.MAX_SAFE_INTEGER`
 * (2^53 - 1). When a key value arrives as a digit string (e.g. `"42"`),
 * {@link coerceKeyValue} converts it to a `Number` so that CAP can resolve
 * the entity lookup correctly.
 *
 * The following numeric CDS types are intentionally excluded:
 *
 * - `Int64` — values may exceed `Number.MAX_SAFE_INTEGER`, causing silent
 *   precision loss. Classified under {@link PRECISION_SENSITIVE_CDS_TYPES}.
 * - `Decimal` — arbitrary-precision type; CAP preserves these as strings
 *   for exact arithmetic. Classified under {@link PRECISION_SENSITIVE_CDS_TYPES}.
 * - `Double` — maps directly to IEEE 754 double-precision (identical to JS
 *   `number`), so there is no precision concern. Excluded here because it is
 *   a floating-point type, not an integer.
 *
 * @see {@link PRECISION_SENSITIVE_CDS_TYPES}
 * @see {@link coerceKeyValue}
 * @see https://tc39.es/ecma262/#sec-number.max_safe_integer — ECMAScript Number.MAX_SAFE_INTEGER
 * @see https://cap.cloud.sap/docs/cds/types — CAP CDS Built-in Types
 */
const SAFE_INTEGER_CDS_TYPES = new Set(["Integer", "Int16", "Int32", "UInt8"]);

/**
 * CDS numeric types where values must be represented as strings to preserve
 * precision: `Int64`, `Decimal`.
 *
 * JavaScript `Number` (IEEE 754 double-precision) cannot faithfully represent
 * all values of these types. When a key value arrives as a `number` from the
 * MCP tool input, {@link coerceKeyValue} normalizes it to a `string` so that
 * CAP can handle it without silent truncation.
 *
 * CAP's `cds.features.ieee754compatible` setting controls whether OData
 * responses serialize `Edm.Int64` and `Edm.Decimal` as JSON strings.
 * Regardless of that setting, this set ensures keys are always passed as
 * strings to the CAP runtime.
 *
 * `Double` is intentionally not included. It maps directly to IEEE 754
 * double-precision — the same representation as a JavaScript `number` — so
 * no precision is lost during coercion. The `ieee754compatible` flag does
 * not affect `Double`.
 *
 * @see {@link SAFE_INTEGER_CDS_TYPES}
 * @see {@link coerceKeyValue}
 * @see https://www.rfc-editor.org/rfc/rfc8259#section-6 — RFC 8259, Section 6: Numbers
 * @see https://cap.cloud.sap/docs/releases/jun24#ieee754compatible — CAP ieee754compatible
 */
const PRECISION_SENSITIVE_CDS_TYPES = new Set(["Int64", "Decimal"]);

/**
 * Coerces a key value between string and number representations based on
 * the CDS type metadata of the target entity element.
 *
 * Coercion rules, applied in order:
 *
 * 1. Safe integer types ({@link SAFE_INTEGER_CDS_TYPES}) — digit-only strings
 *    (e.g. `"42"`) are converted to `Number`. `UInt8` only accepts non-negative
 *    digit strings since it is an unsigned type.
 * 2. Precision-sensitive types ({@link PRECISION_SENSITIVE_CDS_TYPES}) — numeric
 *    values are converted to `String` to prevent silent precision loss beyond
 *    `Number.MAX_SAFE_INTEGER`.
 * 3. All other types — returned unchanged.
 *
 * @param raw - The raw key value received from the MCP tool input.
 * @param cdsType - The CDS type name of the key element (e.g. `"String"`, `"Integer"`).
 * @returns The coerced value, or the original value if no coercion rule applies.
 *
 * @see {@link SAFE_INTEGER_CDS_TYPES}
 * @see {@link PRECISION_SENSITIVE_CDS_TYPES}
 */
export function coerceKeyValue(raw: unknown, cdsType: string): unknown {
  if (typeof raw === "string" && SAFE_INTEGER_CDS_TYPES.has(cdsType)) {
    // UInt8 is unsigned — only accept non-negative digit strings
    const pattern = cdsType === "UInt8" ? /^\d+$/ : /^-?\d+$/;
    if (pattern.test(raw)) {
      return Number(raw);
    }
  }
  if (typeof raw === "number" && PRECISION_SENSITIVE_CDS_TYPES.has(cdsType)) {
    return String(raw);
  }
  return raw;
}

// Map OData operators to CDS/SQL operators for better performance and readability
const ODATA_TO_CDS_OPERATORS = new Map<string, string>([
  ["eq", "="],
  ["ne", "!="],
  ["gt", ">"],
  ["ge", ">="],
  ["lt", "<"],
  ["le", "<="],
]);

/**
 * Builds enhanced query tool description with field types and association examples
 */
function buildEnhancedQueryDescription(resAnno: McpResourceAnnotation): string {
  const associations = Array.from(resAnno.properties.entries())
    .filter(([, cdsType]) =>
      String(cdsType).toLowerCase().includes("association"),
    )
    .map(([name]) => `${name}_ID`);

  const baseDesc = `Query ${resAnno.target} with structured filters, select, orderby, top/skip.`;
  const assocHint =
    associations.length > 0
      ? ` IMPORTANT: For associations, always use foreign key fields (${associations.join(", ")}) - never use association names directly.`
      : "";

  return baseDesc + assocHint;
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
 * If customName is provided via @mcp.wrap.name, uses customName_mode instead.
 */
function nameFor(
  service: string,
  entity: string,
  suffix: EntityOperationMode,
  customName?: string,
): string {
  // Custom name takes priority - uses format: customName_suffix
  if (customName) {
    return `${customName}_${suffix}`;
  }
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
  const toolName = nameFor(
    resAnno.serviceName,
    resAnno.target,
    "query",
    resAnno.wrap?.name,
  );

  // Structured input schema for queries with guard for empty property lists
  const allKeys = Array.from(resAnno.properties.keys());
  const scalarKeys = Array.from(resAnno.properties.entries())
    .filter(
      ([k, cdsType]) =>
        !String(cdsType).toLowerCase().includes("association") &&
        !resAnno.omittedFields?.has(k),
    )
    .map(([name]) => name);

  // Build where field enum: use same fields as select (scalar + foreign keys)
  // This ensures consistency - what you can select, you can filter by
  const whereKeys = [...scalarKeys];

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
              `FILTERABLE FIELDS: ${scalarKeys.join(", ")}. For associations use foreign key (author_ID), NOT association name (author).`,
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
      expand: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          'Expand associations: "*" for all, or array of association names',
        ),
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
    expand: inputZod.shape.expand,
  } as unknown as Record<string, z.ZodType>;

  const hint = constructHintMessage(resAnno, "query");

  const desc =
    `Resource description: ${resAnno.description}. ${buildEnhancedQueryDescription(resAnno)} CRITICAL: Use foreign key fields (e.g., author_ID) for associations - association names (e.g., author) won't work in filters.` +
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

      const result = response?.map((obj: any) =>
        applyOmissionFilter(obj, resAnno),
      );

      LOGGER.debug(
        `[EXECUTION TIME] Query tool completed: ${toolName} in ${Date.now() - t0}ms`,
        { resultKind: args.return ?? "rows" },
      );
      return asMcpResult(
        args.explain ? { data: result, plan: undefined } : result,
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
  const toolName = nameFor(
    resAnno.serviceName,
    resAnno.target,
    "get",
    resAnno.wrap?.name,
  );
  const inputSchema: Record<string, z.ZodType> = {};
  for (const [k, cdsType] of resAnno.resourceKeys.entries()) {
    inputSchema[k] = (determineMcpParameterType(cdsType) as z.ZodType).describe(
      `Key ${k}. ${resAnno.propertyHints.get(k) ?? ""}`,
    );
  }

  const keyList = Array.from(resAnno.resourceKeys.keys()).join(", ");
  const hint = constructHintMessage(resAnno, "get");
  const desc = `Resource description: ${resAnno.description}. Get one ${resAnno.target} by key(s): ${keyList}. For fields & examples call cap_describe_model.${hint}`;

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
    for (const [k, cdsType] of resAnno.resourceKeys.entries()) {
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
      keys[k] = coerceKeyValue(provided, cdsType);
    }

    LOGGER.debug(`Executing READ on ${resAnno.target} with keys`, keys);

    try {
      let response = await withTimeout(
        svc.run(svc.read(resAnno.target, keys)),
        TIMEOUT_MS,
        `${toolName}`,
      );

      LOGGER.debug(
        `[EXECUTION TIME] Get tool completed: ${toolName} in ${Date.now() - startTime}ms`,
        { found: !!response },
      );

      const result = applyOmissionFilter(response, resAnno);
      return asMcpResult(result ?? null);
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
  const toolName = nameFor(
    resAnno.serviceName,
    resAnno.target,
    "create",
    resAnno.wrap?.name,
  );

  const inputSchema: Record<string, z.ZodType> = {};
  for (const [propName, cdsType] of resAnno.properties.entries()) {
    const isAssociation = String(cdsType).toLowerCase().includes("association");
    const isComputed = resAnno.computedFields?.has(propName);
    // Check if this association is marked for deep insert
    if (isAssociation) {
      if (resAnno.deepInsertRefs.has(propName)) {
        // This association has @mcp.deepInsert annotation
        const targetEntityName = resAnno.deepInsertRefs.get(propName);
        inputSchema[propName] = buildDeepInsertZodType(targetEntityName)
          .optional()
          .describe(
            `Deep insert array for ${propName}. ${resAnno.propertyHints.get(propName) ?? ""}`,
          );
      }
      // Skip regular associations (no deep insert)
      continue;
    }
    if (isComputed) {
      continue;
    }

    inputSchema[propName] = (
      determineMcpParameterType(
        cdsType,
        propName,
        `${resAnno.serviceName}.${resAnno.target}`,
      ) as z.ZodType
    )
      .optional()
      .describe(
        resAnno.foreignKeys.has(propName)
          ? `Foreign key to ${resAnno.foreignKeys.get(propName)} on ${propName}. ${resAnno.propertyHints.get(propName) ?? ""}`
          : `Field ${propName}. ${resAnno.propertyHints.get(propName) ?? ""}`,
      );
  }

  const hint = constructHintMessage(resAnno, "create");
  const desc = `Resource description: ${resAnno.description}. Create a new ${resAnno.target}. Provide fields; service applies defaults.${hint}`;

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
        // Check if this association is marked for deep insert
        if (resAnno.deepInsertRefs.has(propName)) {
          // Pass through the nested array for deep insert
          if (args[propName] !== undefined && Array.isArray(args[propName])) {
            data[propName] = args[propName];
          }
          continue;
        }
        // Regular association - use foreign key
        const fkName = `${propName}_ID`;
        if (args[fkName] !== undefined) {
          data[fkName] = args[fkName];
        }
        continue;
      }
      if (args[propName] !== undefined) {
        data[propName] = args[propName];
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

      const result = applyOmissionFilter(response, resAnno);
      return asMcpResult(result ?? {});
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
  const toolName = nameFor(
    resAnno.serviceName,
    resAnno.target,
    "update",
    resAnno.wrap?.name,
  );

  const inputSchema: Record<string, z.ZodType> = {};
  // Keys required
  for (const [k, cdsType] of resAnno.resourceKeys.entries()) {
    inputSchema[k] = (determineMcpParameterType(cdsType) as z.ZodType).describe(
      `Key ${k}. ${resAnno.propertyHints.get(k) ?? ""}`,
    );
  }
  // Other fields optional
  for (const [propName, cdsType] of resAnno.properties.entries()) {
    if (resAnno.resourceKeys.has(propName)) continue;
    const isComputed = resAnno.computedFields?.has(propName);
    const isAssociation = String(cdsType).toLowerCase().includes("association");
    if (isComputed) {
      continue;
    }
    // Check if this association is marked for deep insert
    if (isAssociation) {
      if (resAnno.deepInsertRefs.has(propName)) {
        // This association has @mcp.deepInsert annotation
        const targetEntityName = resAnno.deepInsertRefs.get(propName);
        inputSchema[propName] = buildDeepInsertZodType(targetEntityName)
          .optional()
          .describe(
            `Deep update array for ${propName}. ${resAnno.propertyHints.get(propName) ?? ""}`,
          );
      }
      // Skip regular associations (no deep insert)
      continue;
    }
    inputSchema[propName] = (
      determineMcpParameterType(
        cdsType,
        propName,
        `${resAnno.serviceName}.${resAnno.target}`,
      ) as z.ZodType
    )
      .optional()
      .describe(
        resAnno.foreignKeys.has(propName)
          ? `Foreign key to ${resAnno.foreignKeys.get(propName)} on ${propName}. ${resAnno.propertyHints.get(propName) ?? ""}`
          : `Field ${propName}. ${resAnno.propertyHints.get(propName) ?? ""}`,
      );
  }

  const keyList = Array.from(resAnno.resourceKeys.keys()).join(", ");
  const hint = constructHintMessage(resAnno, "update");
  const desc = `Resource description: ${resAnno.description}. Update ${resAnno.target} by key(s): ${keyList}. Provide fields to update.${hint}`;

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
    for (const [k, cdsType] of resAnno.resourceKeys.entries()) {
      if (args[k] === undefined) {
        return toolError("MISSING_KEY", `Missing key '${k}'`);
      }
      keys[k] = coerceKeyValue(args[k], cdsType);
    }

    // Normalize updates: prefer *_ID for associations and coerce numeric strings
    const updates: Record<string, unknown> = {};
    for (const [propName, cdsType] of resAnno.properties.entries()) {
      if (resAnno.resourceKeys.has(propName)) continue;
      const isAssociation = String(cdsType)
        .toLowerCase()
        .includes("association");
      if (isAssociation) {
        // Check if this association is marked for deep insert
        if (resAnno.deepInsertRefs.has(propName)) {
          // Pass through the nested array for deep update
          if (args[propName] !== undefined && Array.isArray(args[propName])) {
            updates[propName] = args[propName];
          }
          continue;
        }
        // Regular association - use foreign key
        const fkName = `${propName}_ID`;
        if (args[fkName] !== undefined) {
          updates[fkName] = args[fkName];
        }
        continue;
      }
      if (args[propName] !== undefined) {
        updates[propName] = args[propName];
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

      const result = applyOmissionFilter(response, resAnno);
      return asMcpResult(result ?? {});
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
  const toolName = nameFor(
    resAnno.serviceName,
    resAnno.target,
    "delete",
    resAnno.wrap?.name,
  );

  const inputSchema: Record<string, z.ZodType> = {};
  // Keys required for deletion
  for (const [k, cdsType] of resAnno.resourceKeys.entries()) {
    inputSchema[k] = (determineMcpParameterType(cdsType) as z.ZodType).describe(
      `Key ${k}. ${resAnno.propertyHints.get(k) ?? ""}`,
    );
  }

  const keyList = Array.from(resAnno.resourceKeys.keys()).join(", ");
  const hint = constructHintMessage(resAnno, "delete");
  const desc = `Resource description: ${resAnno.description}. Delete ${resAnno.target} by key(s): ${keyList}. This operation cannot be undone.${hint}`;

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
    for (const [k, cdsType] of resAnno.resourceKeys.entries()) {
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
      keys[k] = coerceKeyValue(provided, cdsType);
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

  // Handle expand - must be processed before select to build proper columns
  if (args.expand) {
    // Detect available associations (raw names, NOT _ID suffixed)
    const assocNames = Array.from(resAnno.properties.entries())
      .filter(([, cdsType]) =>
        String(cdsType).toLowerCase().includes("association"),
      )
      .map(([name]) => name);

    // Normalize expand to array (handle both string and array input)
    const expandInput = Array.isArray(args.expand)
      ? args.expand
      : [args.expand];

    // Determine which associations to expand
    const expandList =
      expandInput.includes("*") || expandInput[0] === "*"
        ? assocNames
        : expandInput.filter((e: string) => assocNames.includes(e));

    // Build columns array with expand structures
    if (expandList.length > 0) {
      const expandColumns = expandList.map((name: string) => {
        // Use pre-computed safe columns, or '*' if no omitted fields
        const safeColumns = resAnno.getAssociationSafeColumns(name) ?? ["*"];
        return {
          ref: [name],
          expand: safeColumns,
        };
      });

      // Use safe columns for main entity too
      const mainColumns = resAnno.safeColumns;

      if (args.select?.length) {
        // Filter user's select to only safe columns
        const safeSelect = args.select.filter(
          (field) => !resAnno.omittedFields?.has(field),
        );
        qy = qy.columns(...safeSelect, ...(expandColumns as any));
      } else if (mainColumns[0] === "*") {
        qy = qy.columns("*", ...(expandColumns as any));
      } else {
        qy = qy.columns(...mainColumns, ...(expandColumns as any));
      }
    } else if (args.select?.length) {
      qy = qy.columns(...args.select);
    }
  } else if (args.select?.length) {
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
      // Field names are now consistent - use them directly
      const actualField = field;

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
      const cdsOp = ODATA_TO_CDS_OPERATORS.get(op) ?? op;

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
      const countQuery = SELECT.from(baseQuery.SELECT.from)
        .columns("count(1) as count")
        .where(baseQuery.SELECT.where)
        .limit(
          baseQuery.SELECT.limit?.rows?.val,
          baseQuery.SELECT.limit?.offset?.val,
        )
        .orderBy(baseQuery.SELECT.orderBy);
      const result = await svc.run(countQuery);
      const row = Array.isArray(result) ? result[0] : result;
      return { count: row?.count ?? 0 };
    }
    case "aggregate": {
      if (!args.aggregate?.length) return [];
      const cols = args.aggregate.map(
        (a: any) => `${a.fn}(${a.field}) as ${a.fn}_${a.field}`,
      );
      const aggQuery = SELECT.from(baseQuery.SELECT.from)
        .columns(...cols)
        .where(baseQuery.SELECT.where)
        .limit(
          baseQuery.SELECT.limit?.rows?.val,
          baseQuery.SELECT.limit?.offset?.val,
        )
        .orderBy(baseQuery.SELECT.orderBy);
      return await svc.run(aggQuery);
    }
    default:
      return await svc.run(baseQuery);
  }
}

function constructHintMessage(
  resAnno: McpResourceAnnotation,
  wrapAction: "get" | "query" | "create" | "delete" | "update",
): string {
  if (!resAnno.wrap?.hint) {
    return "";
  } else if (typeof resAnno.wrap.hint === "string") {
    return ` Hint: ${resAnno.wrap?.hint}`;
  }

  if (typeof resAnno.wrap.hint !== "object") {
    throw new Error(`Unparseable hint provided for entity: ${resAnno.name}`);
  }

  return ` Hint: ${resAnno.wrap.hint[wrapAction] ?? ""}`;
}
