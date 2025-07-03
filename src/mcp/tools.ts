import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpToolAnnotation } from "../annotations/structures";
import { determineMcpParameterType } from "./utils";
import { LOGGER } from "../logger";
import { McpParameters } from "./types";
import { Service } from "@sap/cds";
import { ERR_MISSING_SERVICE } from "./constants";

/* @ts-ignore */
const cds = global.cds || require("@sap/cds"); // This is a work around for missing cds context

/**
 * Assigns the annotated tool to the server.
 * This is done by reference, and will therefore mutate the provided server.
 */
/**
 * Assigns the annotated tool to the server.
 * This is done by reference, and will therefore mutate the provided server.
 */
export function assignToolToServer(
  model: McpToolAnnotation,
  server: McpServer,
): void {
  LOGGER.debug("Adding tool", model);
  const parameters = buildToolParameters(model.parameters);

  if (model.entityKey) {
    // Assign tool as bound operation
    assignBoundOperation(parameters, model, server);
    return;
  }

  assignUnboundOperation(parameters, model, server);
}

/**
 * Creates tool handler for bound action/function imports
 */
/**
 * Creates tool handler for bound action/function imports
 */
function assignBoundOperation(
  params: McpParameters,
  model: McpToolAnnotation,
  server: McpServer,
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
  server.registerTool(model.name, { ...keys, ...params }, async (data) => {
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

    for (const [k, v] of Object.entries(data)) {
      if (model.keyTypeMap?.has(k)) {
        operationKeys[k] = v;
      }

      if (!model.parameters?.has(k)) continue;
      operationInput[k] = v;
    }

    const response = await service.send({
      event: model.target,
      entity: model.entityKey as string,
      data: operationInput,
      params: [operationKeys],
    });

    return {
      content: Array.isArray(response)
        ? response.map((el) => ({ type: "text", text: String(el) }))
        : [{ type: "text", text: String(response) }],
    };
  });
}

/**
 * Creates a tool handler for unbound action/function imports
 */
/**
 * Creates a tool handler for unbound action/function imports
 */
function assignUnboundOperation(
  params: McpParameters,
  model: McpToolAnnotation,
  server: McpServer,
): void {
  server.registerTool(model.name, params, async (data) => {
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

    const response = await service.send(model.target, data);
    return {
      content: Array.isArray(response)
        ? response.map((el) => ({ type: "text", text: String(el) }))
        : [{ type: "text", text: String(response) }],
    };
  });
}

/**
 * Builds the parameters that the MCP server should take in for the given tool's parameters
 */
/**
 * Builds the parameters that the MCP server should take in for the given tool's parameters
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
