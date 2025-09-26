import cds from "@sap/cds/eslint.config.mjs";
import { globalIgnores } from "eslint/config";
export default [...cds.recommended, globalIgnores(["lib/*", "test/demo"])];
