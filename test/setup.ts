import { mockLoadConfiguration } from "./helpers/test-config-loader";

export default async () => {
  process.env.CDS_TYPESCRIPT = "true";

  // Mock the configuration loader to always return auth: "none" for tests
  mockLoadConfiguration();

  // Mock CDS environment to disable auth for tests
  // This ensures all tests run with auth: "none" unless explicitly overridden
  const mockCds = {
    env: {
      mcp: {
        auth: "none",
      },
      requires: {
        auth: {
          kind: "dummy", // Set CAP auth to dummy to avoid auth middleware
        },
      },
    },
    context: {
      user: null,
    },
    User: Object.assign(
      function (this: any, data: any) {
        Object.assign(this, data);
      },
      {
        privileged: { id: "privileged", name: "Privileged User" },
        anonymous: { id: "anonymous", _is_anonymous: true },
      },
    ),
    middlewares: {
      before: [], // Empty middleware array for tests
    },
  };

  // Set global CDS mock for tests
  (global as any).cds = mockCds;
};
