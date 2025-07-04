import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpPromptAnnotation } from "../annotations/structures";
import { LOGGER } from "../logger";
import { determineMcpParameterType } from "./utils";
import { McpAnnotationPromptInput } from "../annotations/types";

// NOTE: Not satisfied with below implementation, will need to be revised for full effect

/*
annotate CatalogService with @mcp.prompts: [{
  name      : 'give-me-book-abstract',
  title     : 'Book Abstract',
  description: 'Gives an abstract of a book based on the title',
  template  : 'Search the internet and give me an abstract of the book {{book-id}}', = template
  inputs    : [{ Inputs = Args
    key : 'book-id',
    type: 'String'
  }]
}];
 */

/**
 * Registers prompt templates from a prompt annotation with the MCP server
 * Each prompt template supports variable substitution using {{variable}} syntax
 * @param model - The prompt annotation containing template definitions and inputs
 * @param server - The MCP server instance to register prompts with
 */
export function assignPromptToServer(
  model: McpPromptAnnotation,
  server: McpServer,
): void {
  LOGGER.debug("Adding prompt", model);

  for (const prompt of model.prompts) {
    const inputs = constructInputArgs(prompt.inputs);
    server.registerPrompt(
      prompt.name,
      {
        title: prompt.title,
        description: prompt.description,
        argsSchema: inputs,
      },
      async (args: Record<string, unknown>) => {
        let parsedMsg: string = prompt.template;

        for (const [k, v] of Object.entries(args)) {
          parsedMsg = parsedMsg.replaceAll(`{{${k}}}`, String(v));
        }

        return {
          messages: [
            {
              role: prompt.role,
              content: {
                type: "text",
                text: parsedMsg,
              },
            },
          ],
        };
      },
    );
  }
}

/**
 * Builds Zod schema definitions for prompt input parameters
 * Converts CDS type strings to appropriate Zod validation schemas
 * @param inputs - Array of prompt input parameter definitions
 * @returns Record mapping parameter names to Zod schemas, or undefined if no inputs
 */
function constructInputArgs(
  inputs: McpAnnotationPromptInput[] | undefined,
): Record<string, any> | undefined {
  // Not happy with using any here, but zod types are hard to figure out....
  if (!inputs || inputs.length <= 0) return undefined;
  const result: Record<string, any> = {};

  for (const el of inputs) {
    result[el.key] = determineMcpParameterType(el.type);
  }

  return result;
}
