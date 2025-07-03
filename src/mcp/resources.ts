import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpResourceAnnotation } from "../annotations/structures";
import { LOGGER } from "../logger";
import { Service } from "@sap/cds";
import { writeODataDescriptionForResource } from "./utils";
import { ODataQueryValidator, ODataValidationError } from "./validation";
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

      // Create validator with entity properties
      const validator = new ODataQueryValidator(model.properties);

      // Validate and build query with secure parameter handling
      let query: any;
      try {
        query = SELECT.from(model.target).limit(
          queryParameters.top
            ? validator.validateTop(queryParameters.top)
            : 100,
          queryParameters.skip
            ? validator.validateSkip(queryParameters.skip)
            : undefined,
        );

        for (const [k, v] of Object.entries(queryParameters)) {
          switch (k) {
            case "filter":
              if (v && v.trim().length > 0) {
                const validatedFilter = validator.validateFilter(v);
                const expression = cds.parse.expr(validatedFilter);
                query.where(expression);
              }
              continue;
            case "select":
              if (v && v.trim().length > 0) {
                const validatedColumns = validator.validateSelect(v);
                query.columns(validatedColumns);
              }
              continue;
            case "orderby":
              if (v && v.trim().length > 0) {
                const validatedOrderBy = validator.validateOrderBy(v);
                query.orderBy(validatedOrderBy);
              }
              continue;
            default:
              continue;
          }
        }
      } catch (error) {
        LOGGER.warn(
          `OData query validation failed for ${model.target}:`,
          error,
        );
        return {
          contents: [
            {
              uri: uri.href,
              text: `ERROR: Invalid query parameter - ${error instanceof ODataValidationError ? error.message : "Invalid query syntax"}`,
            },
          ],
        };
      }

      try {
        const response = await service.run(query);
        console.log("QUERY", JSON.stringify(query));
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

      // Create validator even for static resources to validate top parameter
      const validator = new ODataQueryValidator(model.properties);

      try {
        const query = SELECT.from(model.target).limit(
          queryParameters.top
            ? validator.validateTop(queryParameters.top)
            : 100,
        );

        const response = await service.run(query);
        return {
          contents: [
            {
              uri: uri.href,
              text: response ? JSON.stringify(response) : "",
            },
          ],
        };
      } catch (error) {
        if (error instanceof ODataValidationError) {
          LOGGER.warn(
            `OData validation failed for static resource ${model.target}:`,
            error,
          );
          return {
            contents: [
              {
                uri: uri.href,
                text: `ERROR: Invalid query parameter - ${error.message}`,
              },
            ],
          };
        }

        LOGGER.error(
          `Failed to retrieve resource data for ${model.target}`,
          error,
        );
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
