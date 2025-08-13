import { LOGGER } from "../logger";
import { CAPConfiguration, ProjectInfo } from "./types";
import { getSafeEnvVar } from "./env-sanitizer";
import { parseCAPConfiguration, createSafeErrorMessage } from "./json-parser";

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
    auth: cdsEnv?.auth ?? "inherit",
    capabilities: {
      tools: cdsEnv?.capabilities?.tools ?? { listChanged: true },
      resources: cdsEnv?.capabilities?.resources ?? { listChanged: true },
      prompts: cdsEnv?.capabilities?.prompts ?? { listChanged: true },
    },
    wrap_entities_to_actions: cdsEnv?.wrap_entities_to_actions ?? false,
    wrap_entity_modes: cdsEnv?.wrap_entity_modes ?? [
      "query",
      "get",
      "create",
      "update",
    ],
  };
}

/**
 * Extracts project information from environment variables with fallback to defaults
 * Uses npm package environment variables to identify the hosting CAP application
 * @returns Project information object with name and version
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

  // Use secure JSON parser for string configurations
  const parsed = parseCAPConfiguration(config);
  if (!parsed) {
    LOGGER.warn(createSafeErrorMessage("CDS environment configuration"));
    return undefined;
  }

  return parsed;
}
