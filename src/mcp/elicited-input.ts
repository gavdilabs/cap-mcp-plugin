import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ElicitRequest,
  ElicitResult,
} from "@modelcontextprotocol/sdk/types.js";
import { McpElicit } from "../annotations/types";
import { McpAnnotation, McpToolAnnotation } from "../annotations/structures";
import { McpParameters, McpResult } from "./types";
import { z } from "zod";

// TODO: JSDocs

type ElicitSchemaAllowedType = "boolean" | "string" | "number" | "integer";

const INPUT_MSG = "Please fill out the required parameters";

export function isElicitInput(elicits: McpElicit[] | undefined): boolean {
  return elicits ? elicits.includes("input") : false;
}

export function constructElicitationFunctions(
  model: McpToolAnnotation,
  params: McpParameters,
): ElicitRequest["params"][] {
  const result: ElicitRequest["params"][] = [];

  for (const el of model.elicits ?? []) {
    switch (el) {
      case "input":
        result.push(constructElicitInput(params));
        continue;
      case "confirm":
        result.push(contructElicitConfirm(model));
        continue;
      default:
        throw new Error("Invalid elicitation type");
    }
  }

  return result;
}

export interface ElicitationResponse {
  earlyResponse: object | undefined;
  data?: unknown;
}

export async function handleElicitationRequests(
  requests: ElicitRequest["params"][] | undefined,
  server: McpServer,
): Promise<ElicitationResponse> {
  if (!requests || requests.length <= 0) {
    return { earlyResponse: undefined };
  }

  let data: unknown = undefined;
  for (const req of requests) {
    const res = await server.server.elicitInput(req);
    const earlyResponse = handleElicitResponse(res);

    if (earlyResponse) {
      return { earlyResponse };
    }

    if (req.message === INPUT_MSG) {
      data = res.content;
    }
  }

  return {
    earlyResponse: undefined,
    data,
  };
}

function handleElicitResponse(
  elicitResponse: ElicitResult,
): McpResult | undefined {
  switch (elicitResponse.action) {
    case "accept":
      return undefined;
    case "decline":
      return {
        content: [
          {
            type: "text",
            text: "Action was declined.",
          },
        ],
      };
    case "cancel":
      return {
        content: [
          {
            type: "text",
            text: "Action was cancelled",
          },
        ],
      };
    default:
      throw new Error("Invalid elicit response received");
  }
}

function determineSchemaType(param: unknown): ElicitSchemaAllowedType {
  if (param instanceof z.ZodBoolean) {
    return "boolean";
  } else if (param instanceof z.ZodString) {
    return "string";
  } else if (param instanceof z.ZodNumber) {
    return "number";
  }

  throw new Error("Unsupported elicitation input type");
}

function contructElicitConfirm(model: McpAnnotation): ElicitRequest["params"] {
  return {
    message: `Please confirm that you want to perform action '${model.description}'`,
    requestedSchema: {
      type: "object",
      properties: {
        confirm: {
          type: "boolean",
          title: "Confirmation",
          description: "Please confirm the action",
        },
      },
      required: ["confirm"],
    },
  };
}

function constructElicitInput(params: McpParameters): ElicitRequest["params"] {
  const elicitSpec: ElicitRequest["params"] = {
    message: INPUT_MSG,
    requestedSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  };

  for (const [key, zodType] of Object.entries(params)) {
    elicitSpec.requestedSchema.required?.push(key);
    elicitSpec.requestedSchema.properties[key] = {
      type: determineSchemaType(zodType) as any,
      title: key,
      description: key,
    };
  }

  return elicitSpec;
}
