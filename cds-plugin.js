const cds = global.cds; // enforce host app cds instance
const McpPlugin = require("./lib/mcp").default;
const McpBuild = require("./lib/config/build");

// Build tasks
McpBuild.registerBuildTask();

const plugin = new McpPlugin();

// Plugin hooks event registration
cds.on("bootstrap", async (app) => {
  await plugin?.onBootstrap(app);
});

cds.on("serving", async () => {
  await plugin?.onLoaded(cds.model);
});

cds.on("shutdown", async () => {
  await plugin?.onShutdown();
});
