import { utils } from "@sap/cds";
import { CAPConfiguration } from "./types";

export function getMcpInstructions(
  config: CAPConfiguration,
): string | undefined {
  if (!config.instructions) {
    return undefined;
  }

  if (typeof config.instructions === "string") {
    return config.instructions;
  }

  return config.instructions.file
    ? readInstructionsFile(config.instructions.file)
    : undefined;
}

export function readInstructionsFile(path: string): string {
  if (!containsMarkdownType(path)) {
    throw new Error("Invalid file type provided for instructions");
  } else if (!utils.fs.existsSync(path)) {
    throw new Error("Instructions file not found");
  }

  const file = utils.fs.readFileSync(path);
  return file.toString("utf8");
}

function containsMarkdownType(path: string): boolean {
  const extension = path.substring(path.length - 3);
  return extension === ".md";
}
