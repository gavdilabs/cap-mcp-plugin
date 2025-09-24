import { LOGGER } from "../logger";
import { parseCAPConfiguration } from "./json-parser";
import { CAPConfiguration } from "./types";

/* @ts-ignore */
const cds = global.cds || require("@sap/cds"); // This is a work around for missing cds context

export function registerBuildTask(): void {
  cds.build?.register(
    "mcp",
    class McpBuildPlugin extends cds.build.Plugin {
      public static taskDefaults = {};
      private static instructionsPath: string | undefined;

      public static hasTask(): boolean {
        const config = cds.env.mcp as string | CAPConfiguration | undefined;
        if (!config) {
          return false;
        } else if (typeof config === "object") {
          this.instructionsPath =
            typeof config.instructions === "object"
              ? config.instructions.file
              : undefined;
          return (
            this.instructionsPath !== undefined &&
            this.instructionsPath.length > 0
          );
        }

        const parsed = parseCAPConfiguration(config);
        if (!parsed || typeof parsed.instructions !== "object") {
          return false;
        }

        this.instructionsPath =
          typeof parsed.instructions === "object"
            ? parsed.instructions.file
            : undefined;
        return (
          this.instructionsPath !== undefined &&
          this.instructionsPath.length > 0
        );
      }

      public async build(): Promise<void> {
        LOGGER.debug("Performing build task - copy MCP instructions");
        if (!McpBuildPlugin.instructionsPath) {
          return;
        }

        if (
          cds.utils.fs.existsSync(
            this.task.src,
            McpBuildPlugin.instructionsPath,
          )
        ) {
          await this.copy(McpBuildPlugin.instructionsPath).to(
            cds.utils.path.join("srv", McpBuildPlugin.instructionsPath),
          );
        }
      }
    },
  );
}
