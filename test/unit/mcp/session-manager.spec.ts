jest.mock("../../../src/logger", () => ({
  LOGGER: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { McpSessionManager } from "../../../src/mcp/session-manager";
import { CAPConfiguration } from "../../../src/config/types";
import { ParsedAnnotations } from "../../../src/annotations/types";
import {
  createTestConfig,
  mockCdsEnvironment,
} from "../../helpers/mock-config";

// Mock CDS environment before importing anything that uses it
beforeAll(() => {
  mockCdsEnvironment();
  (global as any).cds.log = jest.fn().mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  });
});

describe("McpSessionManager", () => {
  let sessionManager: McpSessionManager;
  let mockConfig: CAPConfiguration;

  beforeEach(() => {
    sessionManager = new McpSessionManager();
    mockConfig = createTestConfig();
  });

  describe("Session Management", () => {
    it("should create a new session", async () => {
      const session = await sessionManager.createSession(mockConfig);

      expect(session).toBeDefined();
      expect(session.server).toBeDefined();
      expect(session.transport).toBeDefined();
    });

    it("should return false when terminating non-existent session", async () => {
      const nonExistentSessionId = "non-existent-session-id";

      const terminated =
        await sessionManager.terminateSession(nonExistentSessionId);

      expect(terminated).toBe(false);
    });

    it("should manually add and terminate session successfully", async () => {
      // Create a session
      const session = await sessionManager.createSession(mockConfig);
      const testSessionId = "test-session-id";

      // Manually add to sessions map (simulating the callback that happens in real usage)
      sessionManager.getSessions().set(testSessionId, session);

      expect(sessionManager.hasSession(testSessionId)).toBe(true);
      expect(sessionManager.getSession(testSessionId)).toBe(session);

      const terminated = await sessionManager.terminateSession(testSessionId);

      expect(terminated).toBe(true);
      expect(sessionManager.hasSession(testSessionId)).toBe(false);
    });

    it("should handle termination errors gracefully", async () => {
      const session = await sessionManager.createSession(mockConfig);
      const testSessionId = "test-session-id";

      // Manually add to sessions map
      sessionManager.getSessions().set(testSessionId, session);

      // Mock the close method to throw an error
      jest
        .spyOn(session.transport, "close")
        .mockRejectedValue(new Error("Transport close error"));

      const terminated = await sessionManager.terminateSession(testSessionId);

      // Should return false due to error, but still remove from sessions map
      expect(terminated).toBe(false);
      expect(sessionManager.hasSession(testSessionId)).toBe(false);
    });

    it("should retrieve all sessions", () => {
      const allSessions = sessionManager.getSessions();
      expect(allSessions).toBeInstanceOf(Map);
      expect(allSessions.size).toBe(0); // Initially empty
    });
  });
});
