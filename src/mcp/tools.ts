import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpToolAnnotation } from "../annotations/structures";
import { determineMcpParameterType, asMcpResult } from "./utils";
import { LOGGER } from "../logger";
import { McpParameters } from "./types";
import { Service } from "@sap/cds";
import { ERR_MISSING_SERVICE } from "./constants";
import { z } from "zod";
import { getAccessRights } from "../auth/utils";
import {
  constructElicitationFunctions,
  handleElicitationRequests,
  isElicitInput,
} from "./elicited-input";

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
  const useElicitInput = isElicitInput(model.elicits);
  const inputSchema = buildZodSchema({
    ...keys,
    ...(useElicitInput ? {} : params),
  });
  const elicitationRequests = constructElicitationFunctions(model, params);

  server.registerTool(
    model.name,
    {
      title: model.name,
      description: model.description,
      inputSchema: inputSchema,
    },
    async (args) => {
      // Resolve from current CAP context; prefer global to align with Jest mocks
      const cdsMod: any = (global as any).cds || cds;
      const servicesMap: any = cdsMod.services || (cdsMod.services = {});
      const service: Service = servicesMap[model.serviceName];
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

      const elicitationResult = await handleElicitationRequests(
        elicitationRequests,
        server,
      );
      if (elicitationResult?.earlyResponse) {
        return elicitationResult.earlyResponse as any;
      }

      const accessRights = getAccessRights(authEnabled);
      const response = await service.tx({ user: accessRights }).send({
        event: model.target,
        entity: model.entityKey as string,
        data: elicitationResult?.data ?? operationInput,
        params: [operationKeys],
      });

      return asMcpResult(response);
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
  const useElicitInput = isElicitInput(model.elicits);
  const inputSchema = buildZodSchema(useElicitInput ? {} : params);
  const elicitationRequests = constructElicitationFunctions(model, params);

  server.registerTool(
    model.name,
    {
      title: model.name,
      description: model.description,
      inputSchema: inputSchema,
    },
    async (args) => {
      // Resolve from current CAP context; prefer global to align with Jest mocks
      const cdsMod: any = (global as any).cds || cds;
      const servicesMap: any = cdsMod.services || (cdsMod.services = {});
      const service: Service = servicesMap[model.serviceName];
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

      const elicitationResult = await handleElicitationRequests(
        elicitationRequests,
        server,
      );
      if (elicitationResult?.earlyResponse) {
        return elicitationResult.earlyResponse as any;
      }

      const accessRights = getAccessRights(authEnabled);
      const response = await service
        .tx({ user: accessRights })
        .send(model.target, elicitationResult?.data ?? args);

      return asMcpResult(response);
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
