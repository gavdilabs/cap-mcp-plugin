import { LOGGER } from "../logger";
import { CAPConfiguration, ProjectInfo } from "./types";
import { getSafeEnvVar } from "./env-sanitizer";

/* @ts-ignore */
const cds = global.cds || require("@sap/cds"); // This is a work around for missing cds context

const ENV_NPM_PACKAGE_NAME = "npm_package_name";
const ENV_NPM_PACKAGE_VERSION = "npm_package_version";
const DEFAULT_PROJECT_INFO: ProjectInfo = {
  name: "cap-mcp-server",
  version: "1.0.0",
};

/**
 * Loads CAP configuration from environment and CDS settings
 * @returns Complete CAP configuration object with defaults applied
 */
export function loadConfiguration(): CAPConfiguration {
  const packageInfo = getProjectInfo();
  const cdsEnv = loadCdsEnvConfiguration();
  return {
    name: cdsEnv?.name ?? packageInfo.name,
    version: cdsEnv?.version ?? packageInfo.version,
    capabilities: {
      tools: cdsEnv?.capabilities?.tools ?? { listChanged: true },
      resources: cdsEnv?.capabilities?.resources ?? { listChanged: true },
      prompts: cdsEnv?.capabilities?.prompts ?? { listChanged: true },
    },
  };
}

/**
 * Retrieves the current runtime's project information.
 * This is used to distinguish the MCP server, by associating it with its parent application.
 *
 * In case of an error, the project info will default to plugin defaults.
 * See constants for reference.
 */
function getProjectInfo(): ProjectInfo {
  try {
    return {
      name: getSafeEnvVar(ENV_NPM_PACKAGE_NAME, DEFAULT_PROJECT_INFO.name),
      version: getSafeEnvVar(
        ENV_NPM_PACKAGE_VERSION,
        DEFAULT_PROJECT_INFO.version,
      ),
    };
  } catch (e) {
    LOGGER.warn(
      "Failed to dynamically load project info, reverting to defaults. Error: ",
      e,
    );
    return DEFAULT_PROJECT_INFO;
  }
}

/**
 * Loads CDS environment configuration from cds.env.mcp
 * @returns CAP configuration object or undefined if not found/invalid
 */
function loadCdsEnvConfiguration(): CAPConfiguration | undefined {
  const config = cds.env.mcp as string | CAPConfiguration | undefined;

  if (!config) return undefined;
  else if (typeof config === "object") return config;

  try {
    return JSON.parse(config);
  } catch (_) {
    LOGGER.warn("Could not parse the configuration object from cdsrc");
    return undefined;
  }
}
