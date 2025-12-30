import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CustomResourceTemplate } from "./custom-resource-template";
import { McpResourceAnnotation } from "../annotations/structures";
import { LOGGER } from "../logger";
import { Service } from "@sap/cds";
import { applyOmissionFilter, writeODataDescriptionForResource } from "./utils";
import { ODataQueryValidator, ODataValidationError } from "./validation";
import { McpResourceQueryParams } from "./types";
import { getAccessRights } from "../auth/utils";

/* @ts-ignore */
const cds = global.cds || require("@sap/cds"); // This is a work around for missing cds context

async function resolveServiceInstance(
  serviceName: string,
): Promise<Service | undefined> {
  const CDS = (global as any).cds || cds;
  let svc: Service | undefined =
    CDS.services?.[serviceName] || CDS.services?.[serviceName.toLowerCase()];
  if (svc) return svc;
  const providers: unknown[] =
    (CDS.service && (CDS.service as any).providers) ||
    (CDS.services && (CDS.services as any).providers) ||
    [];
  if (Array.isArray(providers)) {
    const found = providers.find(
      (p: any) =>
        p?.definition?.name === serviceName || p?.name === serviceName,
    );
    if (found) return found as Service;
  }
  // do not connect; rely on served providers only to avoid duplicate cds contexts
  return undefined;
}

/**
 * Registers a CAP entity as an MCP resource with optional OData query support
 * Creates either static or dynamic resources based on configured functionalities
 * @param model - The resource annotation containing entity metadata and query options
 * @param server - The MCP server instance to register the resource with
 */
export function assignResourceToServer(
  model: McpResourceAnnotation,
  server: McpServer,
  authEnabled: boolean,
): void {
  LOGGER.debug("Adding resource", model);
  if (model.functionalities.size <= 0) {
    registerStaticResource(model, server, authEnabled);
    return;
  }

  // Dynamic resource registration
  const detailedDescription = writeODataDescriptionForResource(model);
  const functionalities = Array.from(model.functionalities);

  // Using grouped query parameter format to fix MCP SDK URI matching issue
  // Format: {?param1,param2,param3} instead of {?param1}{?param2}{?param3}
  const templateParams =
    functionalities.length > 0 ? `{?${functionalities.join(",")}}` : "";
  const resourceTemplateUri = `odata://${model.serviceName}/${model.name}${templateParams}`;
  const template = new CustomResourceTemplate(resourceTemplateUri, {
    list: undefined,
  });

  server.registerResource(
    model.name,
    template as any, // Type assertion to bypass strict type checking - necessary due to broken URI parser in the MCP SDK
    { title: model.target, description: detailedDescription },
    async (uri: URL, variables: unknown) => {
      const queryParameters = variables as McpResourceQueryParams;
      const service = await resolveServiceInstance(model.serviceName);
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
          if (!v || v.trim().length <= 0) continue;
          switch (k) {
            case "filter":
              // BUG: If filter value is e.g. "filter=1234" the value 1234 will go through
              const validatedFilter = validator.validateFilter(v);
              const expression = ((global as any).cds || cds).parse.expr(
                validatedFilter,
              );
              query.where(expression);
              continue;
            case "select":
              const validatedColumns = validator.validateSelect(v);
              query.columns(validatedColumns);
              continue;
            case "orderby":
              const validatedOrderBy = validator.validateOrderBy(v);
              query.orderBy(validatedOrderBy);
              continue;
            case "expand":
              const validatedExpand = validator.validateExpand(v);
              query.columns('*', ...validatedExpand as any);
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
        const accessRights = getAccessRights(authEnabled);
        const response = await service.tx({ user: accessRights }).run(query);
        const result = response?.map((el: any) =>
          applyOmissionFilter(el, model),
        );

        return {
          contents: [
            {
              uri: uri.href,
              text: result ? JSON.stringify(result) : "",
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
 * Registers a static resource without OData query functionality
 * Used when no query functionalities are configured for the resource
 * @param model - The resource annotation with entity metadata
 * @param server - The MCP server instance to register with
 */
function registerStaticResource(
  model: McpResourceAnnotation,
  server: McpServer,
  authEnabled: boolean,
): void {
  server.registerResource(
    model.name,
    `odata://${model.serviceName}/${model.name}`,
    { title: model.target, description: model.description },
    async (uri: URL, extra: any) => {
      const queryParameters = extra as McpResourceQueryParams;
      const service: Service = cds.services[model.serviceName];

      // Create validator even for static resources to validate top parameter
      const validator = new ODataQueryValidator(model.properties);

      try {
        const query = SELECT.from(model.target).limit(
          queryParameters.top
            ? validator.validateTop(queryParameters.top)
            : 100,
        );

        const accessRights = getAccessRights(authEnabled);
        const response = await service.tx({ user: accessRights }).run(query);
        const result = response?.map((el: any) =>
          applyOmissionFilter(el, model),
        );

        return {
          contents: [
            {
              uri: uri.href,
              text: result ? JSON.stringify(result) : "",
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
