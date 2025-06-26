import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpPromptAnnotation } from "../annotations/structures";
import { LOGGER } from "../logger";
import { determineMcpParameterType } from "./utils";
import {
  McpAnnotationPromptInjection,
  McpAnnotationPromptInput,
} from "../annotations/types";
import { Service } from "@sap/cds";

/* @ts-ignore */
const cds = global.cds || require("@sap/cds"); // This is a work around for missing cds context

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
