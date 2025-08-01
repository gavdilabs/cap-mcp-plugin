const cds = global.cds || require("@sap/cds");
const McpPlugin = require("./lib/mcp").default;

const plugin = new McpPlugin();

// Plugin hooks event registration
cds.on("bootstrap", async (app) => {
  await plugin?.onBootstrap(app);
});

cds.on("loaded", async (model) => {
  await plugin?.onLoaded(model);
});

cds.on("shutdown", async () => {
  await plugin?.onShutdown();
});
