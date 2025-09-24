import { utils } from "@sap/cds";
import {
  getMcpInstructions,
  readInstructionsFile,
} from "../../../src/config/instructions";
import { CAPConfiguration } from "../../../src/config/types";

// Mock @sap/cds utils
jest.mock("@sap/cds", () => ({
  utils: {
    fs: {
      existsSync: jest.fn(),
      readFileSync: jest.fn(),
    },
  },
}));

const mockExistsSync = utils.fs.existsSync as jest.MockedFunction<
  typeof utils.fs.existsSync
>;
const mockReadFileSync = utils.fs.readFileSync as jest.MockedFunction<
  typeof utils.fs.readFileSync
>;

describe("Instructions Configuration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getMcpInstructions", () => {
    it("should return undefined when instructions is undefined", () => {
      const config = { instructions: undefined } as CAPConfiguration;
      const result = getMcpInstructions(config);
      expect(result).toBeUndefined();
    });

    it("should return undefined when instructions is null", () => {
      const config = { instructions: null } as unknown as CAPConfiguration;
      const result = getMcpInstructions(config);
      expect(result).toBeUndefined();
    });

    it("should return string directly when instructions is a string", () => {
      const instructionText = "These are string instructions";
      const config = { instructions: instructionText } as CAPConfiguration;
      const result = getMcpInstructions(config);
      expect(result).toBe(instructionText);
    });

    it("should return loaded file content when instructions has file property", () => {
      const filePath = "./test-instructions.md";
      const fileContent =
        "# Test Instructions\n\nThese are file-based instructions.";
      const config = { instructions: { file: filePath } } as CAPConfiguration;

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from(fileContent));

      const result = getMcpInstructions(config);

      expect(mockExistsSync).toHaveBeenCalledWith(filePath);
      expect(mockReadFileSync).toHaveBeenCalledWith(filePath);
      expect(result).toBe(fileContent);
    });

    it("should return undefined when instructions object has no file property", () => {
      const config = { instructions: {} } as CAPConfiguration;
      const result = getMcpInstructions(config);
      expect(result).toBeUndefined();
    });

    it("should return undefined when instructions object has empty file property", () => {
      const config = { instructions: { file: "" } } as CAPConfiguration;
      const result = getMcpInstructions(config);
      expect(result).toBeUndefined();
    });
  });

  describe("readInstructionsFile", () => {
    it("should successfully read existing markdown file", () => {
      const filePath = "./instructions.md";
      const fileContent = "# Instructions\n\nSome content here.";

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from(fileContent));

      const result = readInstructionsFile(filePath);

      expect(mockExistsSync).toHaveBeenCalledWith(filePath);
      expect(mockReadFileSync).toHaveBeenCalledWith(filePath);
      expect(result).toBe(fileContent);
    });

    it("should throw error for non-markdown file extensions", () => {
      const filePath = "./instructions.txt";

      expect(() => readInstructionsFile(filePath)).toThrow(
        "Invalid file type provided for instructions",
      );
      expect(mockExistsSync).not.toHaveBeenCalled();
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    it("should throw error when file does not exist", () => {
      const filePath = "./nonexistent.md";

      mockExistsSync.mockReturnValue(false);

      expect(() => readInstructionsFile(filePath)).toThrow(
        "Instructions file not found",
      );
      expect(mockExistsSync).toHaveBeenCalledWith(filePath);
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    it("should handle UTF-8 encoding correctly", () => {
      const filePath = "./unicode-instructions.md";
      const fileContent = "# Instructions 🚀\n\nWith émojis and spëcial chars.";

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from(fileContent, "utf8"));

      const result = readInstructionsFile(filePath);

      expect(result).toBe(fileContent);
    });

    it("should handle empty markdown file", () => {
      const filePath = "./empty.md";
      const fileContent = "";

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from(fileContent));

      const result = readInstructionsFile(filePath);

      expect(result).toBe(fileContent);
    });

    describe("containsMarkdownType validation", () => {
      it("should accept .md extension", () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(Buffer.from("content"));

        expect(() => readInstructionsFile("file.md")).not.toThrow();
      });

      it("should reject .txt extension", () => {
        expect(() => readInstructionsFile("file.txt")).toThrow(
          "Invalid file type provided for instructions",
        );
      });

      it("should reject .json extension", () => {
        expect(() => readInstructionsFile("file.json")).toThrow(
          "Invalid file type provided for instructions",
        );
      });

      it("should reject files without extension", () => {
        expect(() => readInstructionsFile("README")).toThrow(
          "Invalid file type provided for instructions",
        );
      });

      it("should reject empty string", () => {
        expect(() => readInstructionsFile("")).toThrow(
          "Invalid file type provided for instructions",
        );
      });

      it("should handle case sensitivity correctly", () => {
        expect(() => readInstructionsFile("file.MD")).toThrow(
          "Invalid file type provided for instructions",
        );
      });

      it("should handle paths with directories", () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(Buffer.from("content"));

        expect(() =>
          readInstructionsFile("./docs/instructions.md"),
        ).not.toThrow();
        expect(() =>
          readInstructionsFile("/absolute/path/instructions.md"),
        ).not.toThrow();
      });
    });
  });
});
