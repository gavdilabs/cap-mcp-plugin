import { loadConfiguration } from "../../../src/config/loader";

/* @ts-ignore */
const cds = global.cds || require("@sap/cds");

describe("Enable Model Description", () => {
  beforeEach(() => {
    // Clear any previous mcp configuration
    cds.env.mcp = undefined;
  });

  describe("loadConfiguration", () => {
    it("Should default to true if no configuration is applied", () => {
      // Don't set cds.env.mcp, so it uses the default
      const result = loadConfiguration();
      expect(result.enable_model_description).toBeDefined();
      expect(result.enable_model_description).toEqual(true);
    });

    it("Should be false if set to be so in the app configuration", () => {
      cds.env.mcp = {
        enable_model_description: false,
      };

      const result = loadConfiguration();
      expect(result.enable_model_description).toBeDefined();
      expect(result.enable_model_description).toEqual(false);
    });

    it("Should be true if set to be so in the app configuration", () => {
      cds.env.mcp = {
        enable_model_description: true,
      };

      const result = loadConfiguration();
      expect(result.enable_model_description).toBeDefined();
      expect(result.enable_model_description).toEqual(true);
    });
  });
});
