import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEntityWrappers } from "../../../src/mcp/entity-tools";
import { McpResourceAnnotation } from "../../../src/annotations/structures";
import { WrapAccess } from "../../../src/auth/utils";

describe("entity-tools - registration", () => {
  it("registers query/get/create/update/delete based on modes", () => {
    const server = new McpServer({ name: "t", version: "1" });
    const reg: string[] = [];
    // @ts-ignore override registerTool to capture registrations
    server.registerTool = (name: string) => {
      reg.push(name);
      // return noop handler
      return undefined as any;
    };

    const res = new McpResourceAnnotation(
      "books",
      "Books",
      "Books",
      "CatalogService",
      new Set(["filter", "orderby", "select", "top", "skip"]),
      new Map([
        ["ID", "Integer"],
        ["title", "String"],
      ]),
      new Map([["ID", "Integer"]]),
      { tools: true, modes: ["query", "get", "create", "update", "delete"] },
    );

    const accesses: WrapAccess = {
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
    };
    registerEntityWrappers(res, server, false, ["query", "get"], accesses);

    expect(reg).toEqual(
      expect.arrayContaining([
        "CatalogService_Books_query",
        "CatalogService_Books_get",
        "CatalogService_Books_create",
        "CatalogService_Books_update",
        "CatalogService_Books_delete",
      ]),
    );
  });

  it("registers only delete when delete mode is specified", () => {
    const server = new McpServer({ name: "t", version: "1" });
    const reg: string[] = [];
    // @ts-ignore override registerTool to capture registrations
    server.registerTool = (name: string) => {
      reg.push(name);
      // return noop handler
      return undefined as any;
    };

    const res = new McpResourceAnnotation(
      "books",
      "Books",
      "Books",
      "CatalogService",
      new Set(["filter", "orderby", "select", "top", "skip"]),
      new Map([
        ["ID", "Integer"],
        ["title", "String"],
      ]),
      new Map([["ID", "Integer"]]),
      { tools: true, modes: ["delete"] },
    );

    const accesses: WrapAccess = { canDelete: true };
    registerEntityWrappers(res, server, false, ["delete"], accesses);

    expect(reg).toEqual(["CatalogService_Books_delete"]);
  });

  it("does not register delete for entities without keys", () => {
    const server = new McpServer({ name: "t", version: "1" });
    const reg: string[] = [];
    // @ts-ignore override registerTool to capture registrations
    server.registerTool = (name: string) => {
      reg.push(name);
      // return noop handler
      return undefined as any;
    };

    const res = new McpResourceAnnotation(
      "books",
      "Books",
      "Books",
      "CatalogService",
      new Set(["filter", "orderby", "select", "top", "skip"]),
      new Map([
        ["ID", "Integer"],
        ["title", "String"],
      ]),
      new Map([]), // No keys - delete should not be registered
      { tools: true, modes: ["delete"] },
    );

    const accesses: WrapAccess = { canDelete: true };
    registerEntityWrappers(res, server, false, ["delete"], accesses);

    expect(reg).toEqual([]);
  });
});
