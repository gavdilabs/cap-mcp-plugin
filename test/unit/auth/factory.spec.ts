import { Request, Response, NextFunction } from "express";
import {
  authHandlerFactory,
  errorHandlerFactory,
} from "../../../src/auth/factory";

// Mock the CDS module
jest.mock("@sap/cds", () => ({
  env: {
    requires: {
      auth: {
        kind: "dummy",
      },
    },
  },
  context: {
    user: { id: "test-user", name: "Test User" },
  },
  User: {
    anonymous: { id: "anonymous", _is_anonymous: true },
  },
}));

// Mock the logger
jest.mock("../../../src/logger", () => ({
  LOGGER: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

describe("Authentication Handler", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let jsonSpy: jest.Mock;
  let statusSpy: jest.Mock;

  beforeEach(() => {
    jsonSpy = jest.fn();
    statusSpy = jest.fn().mockReturnValue({ json: jsonSpy });

    mockRequest = {
      headers: {},
    };

    mockResponse = {
      status: statusSpy,
      json: jsonSpy,
    };

    mockNext = jest.fn();

    // Reset CDS environment
    const cds = require("@sap/cds");
    cds.env.requires.auth.kind = "dummy";
    cds.context = { user: { id: "test-user", name: "Test User" } };
  });

  describe("authHandlerFactory", () => {
    it("should allow request through with dummy auth", () => {
      // Arrange
      const cds = require("@sap/cds");
      cds.env.requires.auth.kind = "dummy";
      cds.context = { user: { id: "test-user", name: "Test User" } };
      const handler = authHandlerFactory();

      // Act
      handler(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it("should require authorization header for non-dummy auth", () => {
      // Arrange
      const cds = require("@sap/cds");
      cds.env.requires.auth.kind = "basic";
      cds.context = { user: { id: "test-user", name: "Test User" } };
      const handler = authHandlerFactory();

      // Act
      handler(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        jsonrpc: "2.0",
        error: {
          code: 10,
          message: "Unauthorized",
          id: null,
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should allow request through with authorization header for basic auth", () => {
      // Arrange
      const cds = require("@sap/cds");
      cds.env.requires.auth.kind = "basic";
      cds.context = { user: { id: "test-user", name: "Test User" } };
      mockRequest.headers = {
        authorization: "Basic dGVzdDp0ZXN0", // test:test in base64
      };
      const handler = authHandlerFactory();

      // Act
      handler(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it("should reject request with anonymous user", () => {
      // Arrange
      const cds = require("@sap/cds");
      cds.env.requires.auth.kind = "basic";
      cds.context = { user: cds.User.anonymous };
      mockRequest.headers = {
        authorization: "Basic dGVzdDp0ZXN0",
      };
      const handler = authHandlerFactory();

      // Act
      handler(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        jsonrpc: "2.0",
        error: {
          code: 10,
          message: "Unauthorized",
          id: null,
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should reject request with no user", () => {
      // Arrange
      const cds = require("@sap/cds");
      cds.env.requires.auth.kind = "basic";
      cds.context = { user: null };
      mockRequest.headers = {
        authorization: "Basic dGVzdDp0ZXN0",
      };
      const handler = authHandlerFactory();

      // Act
      handler(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        jsonrpc: "2.0",
        error: {
          code: 10,
          message: "Unauthorized",
          id: null,
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should handle missing CDS context", () => {
      // Arrange
      const cds = require("@sap/cds");
      cds.env.requires.auth.kind = "basic";
      cds.context = null;
      mockRequest.headers = {
        authorization: "Basic dGVzdDp0ZXN0",
      };
      const handler = authHandlerFactory();

      // Act
      handler(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal Error: Context not correctly loaded",
          id: null,
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe("errorHandlerFactory", () => {
    it("should pass through non-authentication errors", () => {
      // Arrange
      const handler = errorHandlerFactory();
      const error = new Error("Some other error");

      // Act
      handler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      // Assert
      expect(mockNext).toHaveBeenCalledWith(error);
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it("should convert 401 number errors to JSON-RPC format", () => {
      // Arrange
      const handler = errorHandlerFactory();
      const error = 401;

      // Act
      handler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      // Assert
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        jsonrpc: "2.0",
        error: {
          code: 10,
          message: "Unauthorized",
          id: null,
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should convert 403 number errors to JSON-RPC format", () => {
      // Arrange
      const handler = errorHandlerFactory();
      const error = 403;

      // Act
      handler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      // Assert
      expect(statusSpy).toHaveBeenCalledWith(403);
      expect(jsonSpy).toHaveBeenCalledWith({
        jsonrpc: "2.0",
        error: {
          code: 10,
          message: "Forbidden",
          id: null,
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
