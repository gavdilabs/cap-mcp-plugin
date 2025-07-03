import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpResourceAnnotation } from "../annotations/structures";
import { LOGGER } from "../logger";
import { Service } from "@sap/cds";
import {
  parseODataFilterString,
  writeODataDescriptionForResource,
} from "./utils";
import { McpResourceQueryParams } from "./types";
// import cds from "@sap/cds";

/* @ts-ignore */
const cds = global.cds || require("@sap/cds"); // This is a work around for missing cds context

/**
 * Assigns a resource annotation to the MCP server
 * @param model - The resource annotation to assign
 * @param server - The MCP server instance to assign the resource to
 */
export function assignResourceToServer(
  model: McpResourceAnnotation,
  server: McpServer,
): void {
  LOGGER.debug("Adding resource", model);
  if (model.functionalities.size <= 0) {
    registerStaticResource(model, server);
    return;
  }

  // Dynamic resource registration
  const detailedDescription = writeODataDescriptionForResource(model);
  const functionalities = Array.from(model.functionalities).map(
    (el) => `{?${el}}`,
  );
  // BUG: RFC compliance breaking bug in the MCP SDK library, must wait for fix....
  const resourceTemplateUri = `odata://${model.serviceName}/${model.name}${functionalities.join("")}`;
  const template = new ResourceTemplate(resourceTemplateUri, {
    list: undefined,
  });

  server.registerResource(
    model.name,
    template,
    { title: model.target, description: detailedDescription },
    async (uri: URL, queryParameters: McpResourceQueryParams) => {
      const service: Service = cds.services[model.serviceName];
      if (!service) {
        LOGGER.error(
          `Invalid service found for service '${model.serviceName}'`,
        );
        throw new Error(
          `Invalid service found for service '${model.serviceName}'`,
        );
      }

      const query = SELECT.from(model.target).limit(
        queryParameters.top ? Number(queryParameters.top) : 100,
        queryParameters.skip ? Number(queryParameters.skip) : undefined,
      );

      for (const [k, v] of Object.entries(queryParameters)) {
        switch (k) {
          case "filter":
            const decoded = parseODataFilterString(v);
            const expression = cds.parse.expr(decoded);
            query.where(expression);
            continue;
          case "select":
            const decodedSelect = decodeURIComponent(v);
            query.columns(decodedSelect.split(","));
            continue;
          case "orderby":
            query.orderBy(decodeURIComponent(v));
            continue;
          default:
            continue;
        }
      }

      try {
        const response = await service.run(query);
        return {
          contents: [
            {
              uri: uri.href,
              text: response ? JSON.stringify(response) : "",
            },
          ],
        };
      } catch (e) {
        LOGGER.error(`Failed to retrieve resource data for ${model.target}`, e);
        return {
          contents: [
            {
              uri: uri.href,
              text: "ERROR: Failed to find data due to unexpected error",
            },
          ],
        };
      }
    },
  );
}

/**
 * Registers a static resource (without query parameters) to the MCP server
 * @param model - The resource annotation to register
 * @param server - The MCP server instance
 */
function registerStaticResource(
  model: McpResourceAnnotation,
  server: McpServer,
): void {
  server.registerResource(
    model.name,
    `odata://${model.serviceName}/${model.name}`,
    { title: model.target, description: model.description },
    async (uri: URL, queryParameters: McpResourceQueryParams) => {
      const service: Service = cds.services[model.serviceName];
      const query = SELECT.from(model.target).limit(
        queryParameters.top ? Number(queryParameters.top) : 100,
      );

      try {
        const response = await service.run(query);
        return {
          contents: [
            {
              uri: uri.href,
              text: response ? JSON.stringify(response) : "",
            },
          ],
        };
      } catch (e) {
        LOGGER.error(`Failed to retrieve resource data for ${model.target}`, e);
        return {
          contents: [
            {
              uri: uri.href,
              text: "ERROR: Failed to find data due to unexpected error",
            },
          ],
        };
      }
    },
  );
}
