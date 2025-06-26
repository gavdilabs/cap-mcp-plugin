/* @ts-ignore */
const cds = global.cds || require("@sap/cds"); // This is a work around for missing cds context

export const LOGGER = cds.log("cds-mcp");
