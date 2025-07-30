import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpToolAnnotation } from "../annotations/structures";
import { determineMcpParameterType } from "./utils";
import { LOGGER } from "../logger";
import { McpParameters } from "./types";
import { Service } from "@sap/cds";
import { ERR_MISSING_SERVICE } from "./constants";
import { z } from "zod";
import { getAccessRights } from "../auth/utils";

/* @ts-ignore */
const cds = global.cds || require("@sap/cds"); // This is a work around for missing cds context

/**
 * Registers a CAP function or action as an executable MCP tool
 * Handles both bound (entity-level) and unbound (service-level) operations
 * @param model - The tool annotation containing operation metadata and parameters
 * @param server - The MCP server instance to register the tool with
 */
export function assignToolToServer(
  model: McpToolAnnotation,
  server: McpServer,
  authEnabled: boolean,
): void {
  LOGGER.debug("Adding tool", model);
  const parameters = buildToolParameters(model.parameters);

  if (model.entityKey) {
    // Assign tool as bound operation
    assignBoundOperation(parameters, model, server, authEnabled);
    return;
  }

  assignUnboundOperation(parameters, model, server, authEnabled);
}

/**
 * Registers a bound operation that operates on a specific entity instance
 * Requires entity key parameters in addition to operation parameters
 * @param params - Zod schema definitions for operation parameters
 * @param model - Tool annotation with bound operation metadata
 * @param server - MCP server instance to register with
 */
function assignBoundOperation(
  params: McpParameters,
  model: McpToolAnnotation,
  server: McpServer,
  authEnabled: boolean,
): void {
  if (!model.keyTypeMap || model.keyTypeMap.size <= 0) {
    LOGGER.error(
      "Invalid tool assignment - missing key map for bound operation",
    );
    throw new Error(
      "Bound operation cannot be assigned to tool list, missing keys",
    );
  }

  const keys = buildToolParameters(model.keyTypeMap);
  const inputSchema = buildZodSchema({ ...keys, ...params });

  server.registerTool(
    model.name,
    {
      title: model.name,
      description: model.description,
      inputSchema: inputSchema,
    },
    async (args) => {
      const service: Service = cds.services[model.serviceName];
      if (!service) {
        LOGGER.error("Invalid CAP service - undefined");
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: ERR_MISSING_SERVICE,
            },
          ],
        };
      }

      const operationInput: Record<string, unknown> = {};
      const operationKeys: Record<string, unknown> = {};

      for (const [k, v] of Object.entries(args)) {
        if (model.keyTypeMap?.has(k)) {
          operationKeys[k] = v;
        }

        if (!model.parameters?.has(k)) continue;
        operationInput[k] = v;
      }

      const accessRights = getAccessRights(authEnabled);
      const response = await service.tx({ user: accessRights }).send({
        event: model.target,
        entity: model.entityKey as string,
        data: operationInput,
        params: [operationKeys],
      });

      return {
        content: Array.isArray(response)
          ? response.map((el) => ({
              type: "text",
              text: formatResponseValue(el),
            }))
          : [{ type: "text", text: formatResponseValue(response) }],
      };
    },
  );
}

/**
 * Registers an unbound operation that operates at the service level
 * Does not require entity keys, only operation parameters
 * @param params - Zod schema definitions for operation parameters
 * @param model - Tool annotation with unbound operation metadata
 * @param server - MCP server instance to register with
 */
function assignUnboundOperation(
  params: McpParameters,
  model: McpToolAnnotation,
  server: McpServer,
  authEnabled: boolean,
): void {
  const inputSchema = buildZodSchema(params);

  server.registerTool(
    model.name,
    {
      title: model.name,
      description: model.description,
      inputSchema: inputSchema,
    },
    async (args) => {
      const service: Service = cds.services[model.serviceName];
      if (!service) {
        LOGGER.error("Invalid CAP service - undefined");
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: ERR_MISSING_SERVICE,
            },
          ],
        };
      }

      const accessRights = getAccessRights(authEnabled);
      const response = await service
        .tx({ user: accessRights })
        .send(model.target, args);

      return {
        content: Array.isArray(response)
          ? response.map((el) => ({
              type: "text",
              text: formatResponseValue(el),
            }))
          : [{ type: "text", text: formatResponseValue(response) }],
      };
    },
  );
}

/**
 * Converts a map of CDS parameter types to MCP parameter schema definitions
 * @param params - Map of parameter names to their CDS type strings
 * @returns Record of parameter names to Zod schema types
 */
function buildToolParameters(
  params: Map<string, string> | undefined,
): McpParameters {
  if (!params || params.size <= 0) return {};

  const result: McpParameters = {};
  for (const [k, v] of params.entries()) {
    result[k] = determineMcpParameterType(v);
  }
  return result;
}

/**
 * Converts a value to a string representation suitable for MCP responses
 * Handles objects and arrays by JSON stringifying them instead of using String()
 * @param value - The value to convert to string
 * @returns String representation of the value
 */
function formatResponseValue(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      // Fallback to String() if JSON.stringify fails (e.g., circular references)
      return String(value);
    }
  }

  return String(value);
}

/**
 * Constructs a complete Zod schema object for MCP tool input validation
 * @param params - Record of parameter names to Zod schema types
 * @returns Zod schema record suitable for MCP tool registration
 */
function buildZodSchema(params: McpParameters): Record<string, z.ZodType> {
  const schema: Record<string, z.ZodType> = {};

  for (const [key, zodType] of Object.entries(params)) {
    // The parameter is already a Zod type from determineMcpParameterType
    if (zodType && typeof zodType === "object" && "describe" in zodType) {
      schema[key] = zodType as z.ZodType;
    } else {
      // Fallback to string if not a valid Zod type
      schema[key] = z.string().describe(`Parameter: ${key}`);
    }
  }

  return schema;
}
