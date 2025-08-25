import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { asMcpResult } from "./utils";
import { z } from "zod";

/**
 * Registers a discovery tool that describes CAP services/entities and fields.
 * Helpful for models to plan correct tool calls without trial-and-error.
 */
export function registerDescribeModelTool(server: McpServer): void {
  const inputZod = z
    .object({
      service: z.string().optional(),
      entity: z.string().optional(),
      format: z.enum(["concise", "detailed"]).default("concise").optional(),
    })
    .strict();

  const inputSchema: Record<string, z.ZodType> = {
    service: inputZod.shape.service,
    entity: inputZod.shape.entity,
    format: inputZod.shape.format,
  } as unknown as Record<string, z.ZodType>;

  server.registerTool(
    "cap_describe_model",
    {
      title: "cap_describe_model",
      description:
        "Describe CAP services/entities and their fields, keys, and example tool calls. Use this to guide LLMs how to call entity wrapper tools.",
      inputSchema,
    },
    async (rawArgs: Record<string, unknown>) => {
      const args = inputZod.parse(rawArgs);
      const CDS: any = (global as any).cds;
      const refl = CDS.reflect(CDS.model);

      const listServices = () => {
        const names = Object.values(CDS.services || {})
          .map((s: any) => s?.definition?.name || s?.name)
          .filter(Boolean);
        return { services: [...new Set(names as string[])].sort() };
      };

      const listEntities = (service?: string) => {
        const all = (Object.values(refl.entities || {}) as any[]) || [];
        const filtered = service
          ? all.filter((e) => String(e.name).startsWith(service + "."))
          : all;
        return {
          entities: filtered.map((e) => e.name).sort(),
        };
      };

      const describeEntity = (service?: string, entity?: string) => {
        if (!entity) return { error: "Please provide 'entity'." };
        const fqn =
          service && !entity.includes(".") ? `${service}.${entity}` : entity;
        const ent = (refl.entities || {})[fqn] || (refl.entities || {})[entity];
        if (!ent)
          return {
            error: `Entity not found: ${entity}${service ? ` (service ${service})` : ""}`,
          };

        const elements = Object.entries(ent.elements || {}).map(
          ([name, el]: any) => ({
            name,
            type: el.type,
            key: !!el.key,
            target: el.target || undefined,
            isArray: !!el.items,
          }),
        );

        const keys = elements.filter((e) => e.key).map((e) => e.name);
        const sampleTop = 5;
        // Prefer scalar fields for sample selects; exclude associations
        const scalarFields = elements
          .filter((e) => String(e.type).toLowerCase() !== "cds.association")
          .map((e) => e.name);
        const shortFields = scalarFields.slice(0, 5);

        // Match wrapper tool naming: Service_Entity_mode
        const entName = String(ent?.name || "entity");
        const svcPart = service || entName.split(".")[0] || "Service";
        const entityBase = entName.split(".").pop() || "Entity";
        const listName = `${svcPart}_${entityBase}_query`;
        const getName = `${svcPart}_${entityBase}_get`;

        return {
          service,
          entity: ent.name,
          keys,
          fields: elements,
          usage: {
            rationale:
              "Entity wrapper tools expose CRUD-like operations for LLMs. Prefer query/get globally; create/update must be explicitly enabled by the developer.",
            guidance:
              "Use the *_query tool for retrieval with filters and projections. select/orderby support only scalar fields (no associations). To filter by an association, use the association field name with the key value (e.g., {field:'author',op:'eq',value:4}). Use *_get with keys for a single record; use *_create/*_update only if enabled and necessary.",
          },
          examples: {
            list_tool: listName,
            list_tool_payload: {
              top: sampleTop,
              select: shortFields,
            },
            get_tool: getName,
            get_tool_payload: keys.length ? { [keys[0]]: "<value>" } : {},
          },
        };
      };

      let json: any;
      if (!args.service && !args.entity) {
        json = { ...listServices(), ...listEntities(undefined) };
      } else if (args.service && !args.entity) {
        json = { service: args.service, ...listEntities(args.service) };
      } else {
        json = describeEntity(args.service, args.entity);
      }

      return asMcpResult(json);
    },
  );
}
