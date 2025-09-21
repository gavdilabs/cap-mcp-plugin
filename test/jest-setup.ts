// Jest setup file for mocks
// This file runs before each test file

// Mock @sap/xssec to prevent real XSUAA service instantiation in tests
jest.mock("@sap/xssec", () => ({
  XsuaaService: jest.fn().mockImplementation(() => ({
    verifyJwt: jest.fn().mockResolvedValue({}),
    getJwtClaims: jest.fn().mockReturnValue({}),
  })),
}));
