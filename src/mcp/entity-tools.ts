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
import {
  EntityOperationMode,
  EntityListQueryArgs,
  DraftEntityDefinition,
  DraftCreationResult,
} from "./types";
import type { csn, ql, Service } from "@sap/cds";
import cds from "@sap/cds";
import { getDraftDefinition, getErrorMessage } from "../annotations/utils";

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
  const CDS = global.cds;
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
  const CDS = global.cds;
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
    const CDS = global.cds;
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
    } catch (e: unknown) {
      return toolError("FILTER_PARSE_ERROR", getErrorMessage(e));
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
    } catch (error: unknown) {
      const msg = `QUERY_FAILED: ${getErrorMessage(error)}`;
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
      `Key ${k}. ${resAnno.propertyHints.get(k) ?? ""}`,
    );
  }

  const keyList = Array.from(resAnno.resourceKeys.keys()).join(", ");
  const hint = constructHintMessage(resAnno, "get");
  const desc = `Resource description: ${resAnno.description}. Get one ${resAnno.target} by key(s): ${keyList}. For fields & examples call cap_describe_model.${hint}`;

  const getHandler = async (args: Record<string, unknown>) => {
    const startTime = Date.now();
    const CDS = global.cds;
    LOGGER.debug(`[EXECUTION TIME] Get tool invoked: ${toolName}`, { args });

    const svc = await resolveServiceInstance(resAnno.serviceName);
    if (!svc) {
      const msg = `Service not found: ${resAnno.serviceName}. Available: ${Object.keys(CDS.services || {}).join(", ")}`;
      LOGGER.error(msg);
      return toolError("ERR_MISSING_SERVICE", msg);
    }

    // Normalize single-key shorthand, case-insensitive keys, and value-only payloads
    let normalizedArgs: any = args;
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
        if (alt) normalizedArgs[onlyKey] = normalizedArgs[alt[0]];
      }
    }

    const keys: Record<string, unknown> = {};
    for (const [k] of resAnno.resourceKeys.entries()) {
      let provided = normalizedArgs[k];
      if (provided === undefined) {
        const alt = Object.entries(normalizedArgs || {}).find(
          ([kk]) => String(kk).toLowerCase() === String(k).toLowerCase(),
        );
        if (alt) provided = normalizedArgs[alt[0]];
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
    } catch (error: unknown) {
      const msg = `GET_FAILED: ${getErrorMessage(error)}`;
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
 * Creates a root draft entity using CAP's NEW event.
 * Triggers the full draft lifecycle including DraftAdministrativeData creation.
 */
async function createRootDraft(
  svc: Service,
  draftEntityDef: DraftEntityDefinition,
  data: Record<string, unknown>,
  toolName: string,
): Promise<DraftCreationResult> {
  return withTimeout(
    svc.send("NEW", draftEntityDef, data),
    TIMEOUT_MS,
    `${toolName} (draft create)`,
  );
}

/**
 * Creates a draft composition child by inserting directly into the draft shadow table.
 *
 * Manual UUID generation is necessary because:
 * - CAP's svc.send('NEW') only works for root entities, not composition children
 * - We use explicit .columns().values() INSERT to avoid @Core.Computed field errors
 * - This low-level approach bypasses CAP's @cds.on.defaults handler that would auto-generate UUIDs
 *
 * UUID strategy: CDS.utils.uuid() (CAP-native) with fallback to crypto.randomUUID()
 */
async function createDraftCompositionChild(
  svc: Service,
  resAnno: McpResourceAnnotation,
  draftEntityDef: DraftEntityDefinition,
  data: Record<string, unknown>,
  toolName: string,
  authEnabled: boolean,
): Promise<DraftCreationResult> {
  const CDS = global.cds;
  const { INSERT, SELECT } = CDS.ql;

  // Auto-generate UUID for composition child
  // CRITICAL: This is necessary because we use explicit .columns().values() insertion
  // which bypasses CAP's default handlers that would normally auto-generate UUIDs.
  // See function-level JSDoc for detailed explanation of why this approach is required.
  if (!data.ID) {
    data.ID = CDS.utils?.uuid?.() || require("crypto").randomUUID();
  }

  // Set draft-specific fields
  data.HasActiveEntity = false;
  data.IsActiveEntity = false;

  // Look up parent draft's DraftAdministrativeData_DraftUUID if not provided
  if (!data.DraftAdministrativeData_DraftUUID && data.up__ID) {
    await resolveParentDraftUUID(svc, resAnno, data);
  }

  // Build explicit column list from provided data only
  // This avoids CDS inserting @Core.Computed fields that may not exist in DB
  const columns = Object.keys(data).filter((k) => data[k] !== undefined);
  const values = columns.map((k) => data[k]);

  const tx = svc.tx({ user: getAccessRights(authEnabled) });
  try {
    const insertResult = await withTimeout(
      tx.run(
        INSERT.into(draftEntityDef)
          .columns(...columns)
          .values(...values),
      ),
      TIMEOUT_MS,
      `${toolName} (draft composition child)`,
      async () => {
        try {
          await tx.rollback();
        } catch {}
      },
    );
    try {
      await tx.commit();
    } catch {}

    // Return the data as result since .columns().values() may return just count
    if (
      typeof insertResult === "number" ||
      !insertResult ||
      Object.keys(insertResult).length === 0
    ) {
      return { ...data } as DraftCreationResult;
    }
    return insertResult as DraftCreationResult;
  } catch (txError: unknown) {
    try {
      await tx.rollback();
    } catch {}
    throw txError;
  }
}

/**
 * Resolves the parent draft's DraftAdministrativeData_DraftUUID for composition children.
 * Mutates the data object to add the DraftUUID if found.
 */
async function resolveParentDraftUUID(
  svc: Service,
  resAnno: McpResourceAnnotation,
  data: Record<string, unknown>,
): Promise<void> {
  const CDS = global.cds;
  const { SELECT } = CDS.ql;

  // Derive parent entity from target name (e.g. "ConsumptionRequests.chargeSheets" → "ConsumptionRequests")
  const parentEntityName = resAnno.target.substring(
    0,
    resAnno.target.lastIndexOf("."),
  );
  const parentEntityDef = svc.entities?.[parentEntityName];
  const parentDraftDef = getDraftDefinition(parentEntityDef);

  if (!parentDraftDef) return;

  try {
    const parentDraft = await svc.run(
      SELECT.one
        .from(parentDraftDef)
        .columns("DraftAdministrativeData_DraftUUID")
        .where({ ID: data.up__ID, IsActiveEntity: false }),
    );
    if (parentDraft?.DraftAdministrativeData_DraftUUID) {
      data.DraftAdministrativeData_DraftUUID =
        parentDraft.DraftAdministrativeData_DraftUUID;
      LOGGER.debug(
        `[MCP-DRAFT] Resolved parent DraftUUID: ${data.DraftAdministrativeData_DraftUUID} from ${parentEntityName}`,
      );
    } else {
      LOGGER.warn(
        `[MCP-DRAFT] Could not find parent draft for ${parentEntityName} with ID ${data.up__ID}`,
      );
    }
  } catch (lookupErr: unknown) {
    LOGGER.warn(
      `[MCP-DRAFT] Failed to lookup parent draft UUID: ${getErrorMessage(lookupErr)}`,
    );
  }
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
    const CDS = global.cds;
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

    // Resolve entity definition and check for draft capability at runtime.
    // This covers both directly draft-enabled entities (@odata.draft.enabled)
    // AND composition children of draft-enabled entities (they inherit .drafts)
    const entityDef = svc.entities?.[resAnno.target];
    const draftEntityDef = entityDef?.drafts;
    const isDraftCompositionChild = !resAnno.isDraftEnabled && !!draftEntityDef;
    const shouldUseDraftPath =
      resAnno.isDraftEnabled || isDraftCompositionChild;

    // Handle draft-enabled entities and composition children of draft entities
    if (shouldUseDraftPath) {
      if (!draftEntityDef) {
        const msg = `Draft entity definition not found for ${resAnno.target}. Entity may not be draft-enabled.`;
        LOGGER.error(msg);
        return toolError("DRAFT_CREATE_FAILED", msg);
      }

      LOGGER.debug(
        `[MCP-DRAFT] Creating draft for ${resAnno.target} via ${isDraftCompositionChild ? "composition child INSERT" : "NEW event"}`,
      );

      try {
        const draftResult = isDraftCompositionChild
          ? await createDraftCompositionChild(
              svc,
              resAnno,
              draftEntityDef as unknown as DraftEntityDefinition,
              data,
              toolName,
              authEnabled,
            )
          : await createRootDraft(
              svc,
              draftEntityDef as unknown as DraftEntityDefinition,
              data,
              toolName,
            );

        LOGGER.info(
          `[MCP-DRAFT] Draft created for ${resAnno.target}. DraftUUID: ${draftResult?.DraftAdministrativeData_DraftUUID}`,
        );
        const result = applyOmissionFilter(draftResult, resAnno);
        return asMcpResult(result ?? {});
      } catch (error: unknown) {
        const errorMsg = getErrorMessage(error);
        const isTimeout = errorMsg.includes("timed out");
        const msg = isTimeout
          ? `${toolName} (draft) timed out after ${TIMEOUT_MS}ms`
          : `DRAFT_CREATE_FAILED: ${errorMsg}`;
        LOGGER.error(msg, error);
        return toolError(isTimeout ? "TIMEOUT" : "DRAFT_CREATE_FAILED", msg);
      }
    }

    // Non-draft flow: use transaction-based INSERT
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
    } catch (error: unknown) {
      try {
        await tx.rollback();
      } catch {}
      const errorMsg = getErrorMessage(error);
      const isTimeout = errorMsg.includes("timed out");
      const msg = isTimeout
        ? `${toolName} timed out after ${TIMEOUT_MS}ms`
        : `CREATE_FAILED: ${errorMsg}`;
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
    const CDS = global.cds;
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
    } catch (error: unknown) {
      try {
        await tx.rollback();
      } catch {}
      const errorMsg = getErrorMessage(error);
      const isTimeout = errorMsg.includes("timed out");
      const msg = isTimeout
        ? `${toolName} timed out after ${TIMEOUT_MS}ms`
        : `UPDATE_FAILED: ${errorMsg}`;
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
      `Key ${k}. ${resAnno.propertyHints.get(k) ?? ""}`,
    );
  }

  const keyList = Array.from(resAnno.resourceKeys.keys()).join(", ");
  const hint = constructHintMessage(resAnno, "delete");
  const desc = `Resource description: ${resAnno.description}. Delete ${resAnno.target} by key(s): ${keyList}. This operation cannot be undone.${hint}`;

  const deleteHandler = async (args: Record<string, unknown>) => {
    const CDS = global.cds;
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
    } catch (error: unknown) {
      try {
        await tx.rollback();
      } catch {}
      const errorMsg = getErrorMessage(error);
      const isTimeout = errorMsg.includes("timed out");
      const msg = isTimeout
        ? `${toolName} timed out after ${TIMEOUT_MS}ms`
        : `DELETE_FAILED: ${errorMsg}`;
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
