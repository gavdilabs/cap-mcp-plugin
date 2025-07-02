import { assignPromptToServer } from "../../../src/mcp/prompts";
import { McpPromptAnnotation } from "../../../src/annotations/structures";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Mock dependencies
jest.mock("../../../src/logger", () => ({
  LOGGER: {
    debug: jest.fn(),
  },
}));

jest.mock("../../../src/mcp/utils", () => ({
  determineMcpParameterType: jest.fn((type) => `mock-${type}`),
}));

// Create a mock server with registerPrompt method
const createMockServer = () => ({
  registerPrompt: jest.fn(),
});

describe("Prompts", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let promptAnnotation: McpPromptAnnotation;

  beforeEach(() => {
    mockServer = createMockServer();

    promptAnnotation = new McpPromptAnnotation(
      "test-prompt",
      "Test prompt description",
      "TestService",
      [
        {
          name: "simple-prompt",
          title: "Simple Prompt",
          description: "A simple test prompt",
          template: "Hello {{name}}!",
          role: "user",
          inputs: [{ key: "name", type: "String" }],
        },
      ],
    );
  });

  describe("assignPromptToServer", () => {
    test("should register prompt with inputs", () => {
      assignPromptToServer(promptAnnotation, mockServer as any as McpServer);

      expect(mockServer.registerPrompt).toHaveBeenCalledWith(
        "simple-prompt",
        {
          title: "Simple Prompt",
          description: "A simple test prompt",
          argsSchema: { name: "mock-String" },
        },
        expect.any(Function),
      );
    });

    test("should register prompt without inputs", () => {
      const promptWithoutInputs = new McpPromptAnnotation(
        "no-input-prompt",
        "No input prompt description",
        "TestService",
        [
          {
            name: "no-input",
            title: "No Input Prompt",
            description: "A prompt without inputs",
            template: "Static message",
            role: "assistant",
          },
        ],
      );

      assignPromptToServer(promptWithoutInputs, mockServer as any as McpServer);

      expect(mockServer.registerPrompt).toHaveBeenCalledWith(
        "no-input",
        {
          title: "No Input Prompt",
          description: "A prompt without inputs",
          argsSchema: undefined,
        },
        expect.any(Function),
      );
    });

    test("should register multiple prompts", () => {
      const multiplePrompts = new McpPromptAnnotation(
        "multiple-prompts",
        "Multiple prompts description",
        "TestService",
        [
          {
            name: "prompt1",
            title: "Prompt 1",
            description: "First prompt",
            template: "Template 1",
            role: "user",
          },
          {
            name: "prompt2",
            title: "Prompt 2",
            description: "Second prompt",
            template: "Template 2",
            role: "assistant",
          },
        ],
      );

      assignPromptToServer(multiplePrompts, mockServer as any as McpServer);

      expect(mockServer.registerPrompt).toHaveBeenCalledTimes(2);
      expect(mockServer.registerPrompt).toHaveBeenNthCalledWith(
        1,
        "prompt1",
        expect.any(Object),
        expect.any(Function),
      );
      expect(mockServer.registerPrompt).toHaveBeenNthCalledWith(
        2,
        "prompt2",
        expect.any(Object),
        expect.any(Function),
      );
    });

    test("should handle prompt execution with template replacement", async () => {
      assignPromptToServer(promptAnnotation, mockServer as any as McpServer);

      const promptHandler = mockServer.registerPrompt.mock.calls[0][2];
      const result = await promptHandler({ name: "World" });

      expect(result).toEqual({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Hello World!",
            },
          },
        ],
      });
    });

    test("should handle prompt execution with multiple template variables", async () => {
      const complexPrompt = new McpPromptAnnotation(
        "complex-prompt",
        "Complex prompt",
        "TestService",
        [
          {
            name: "complex",
            title: "Complex Prompt",
            description: "A complex prompt with multiple variables",
            template:
              "Hello {{name}}, you are {{age}} years old and live in {{city}}.",
            role: "user",
            inputs: [
              { key: "name", type: "String" },
              { key: "age", type: "Integer" },
              { key: "city", type: "String" },
            ],
          },
        ],
      );

      assignPromptToServer(complexPrompt, mockServer as any as McpServer);

      const promptHandler = mockServer.registerPrompt.mock.calls[0][2];
      const result = await promptHandler({
        name: "John",
        age: 30,
        city: "Paris",
      });

      expect(result).toEqual({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Hello John, you are 30 years old and live in Paris.",
            },
          },
        ],
      });
    });

    test("should handle prompt execution with missing template variables", async () => {
      assignPromptToServer(promptAnnotation, mockServer as any as McpServer);

      const promptHandler = mockServer.registerPrompt.mock.calls[0][2];
      const result = await promptHandler({ otherParam: "value" });

      expect(result).toEqual({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Hello {{name}}!",
            },
          },
        ],
      });
    });

    test("should handle empty inputs array", () => {
      const promptWithEmptyInputs = new McpPromptAnnotation(
        "empty-inputs-prompt",
        "Empty inputs prompt",
        "TestService",
        [
          {
            name: "empty-inputs",
            title: "Empty Inputs",
            description: "Prompt with empty inputs array",
            template: "Static template",
            role: "user",
            inputs: [],
          },
        ],
      );

      assignPromptToServer(
        promptWithEmptyInputs,
        mockServer as any as McpServer,
      );

      expect(mockServer.registerPrompt).toHaveBeenCalledWith(
        "empty-inputs",
        {
          title: "Empty Inputs",
          description: "Prompt with empty inputs array",
          argsSchema: undefined,
        },
        expect.any(Function),
      );
    });

    test("should handle prompt with multiple inputs of different types", () => {
      const multiTypePrompt = new McpPromptAnnotation(
        "multi-type-prompt",
        "Multi type prompt",
        "TestService",
        [
          {
            name: "multi-type",
            title: "Multi Type Prompt",
            description: "Prompt with different input types",
            template: "Template with {{stringParam}} and {{intParam}}",
            role: "assistant",
            inputs: [
              { key: "stringParam", type: "String" },
              { key: "intParam", type: "Integer" },
              { key: "customParam", type: "CustomType" },
            ],
          },
        ],
      );

      assignPromptToServer(multiTypePrompt, mockServer as any as McpServer);

      expect(mockServer.registerPrompt).toHaveBeenCalledWith(
        "multi-type",
        {
          title: "Multi Type Prompt",
          description: "Prompt with different input types",
          argsSchema: {
            stringParam: "mock-String",
            intParam: "mock-Integer",
            customParam: "mock-CustomType",
          },
        },
        expect.any(Function),
      );
    });

    test("should handle prompt execution with no arguments", async () => {
      const noArgPrompt = new McpPromptAnnotation(
        "no-arg-prompt",
        "No argument prompt",
        "TestService",
        [
          {
            name: "no-arg",
            title: "No Argument Prompt",
            description: "Prompt without arguments",
            template: "Static template without variables",
            role: "user",
          },
        ],
      );

      assignPromptToServer(noArgPrompt, mockServer as any as McpServer);

      const promptHandler = mockServer.registerPrompt.mock.calls[0][2];
      const result = await promptHandler({});

      expect(result).toEqual({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Static template without variables",
            },
          },
        ],
      });
    });

    test("should handle assistant role prompts", async () => {
      const assistantPrompt = new McpPromptAnnotation(
        "assistant-prompt",
        "Assistant prompt",
        "TestService",
        [
          {
            name: "assistant",
            title: "Assistant Prompt",
            description: "Prompt with assistant role",
            template: "Assistant response: {{response}}",
            role: "assistant",
            inputs: [{ key: "response", type: "String" }],
          },
        ],
      );

      assignPromptToServer(assistantPrompt, mockServer as any as McpServer);

      const promptHandler = mockServer.registerPrompt.mock.calls[0][2];
      const result = await promptHandler({ response: "Hello!" });

      expect(result).toEqual({
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: "Assistant response: Hello!",
            },
          },
        ],
      });
    });

    test("should handle edge case with special characters in template", async () => {
      const specialCharPrompt = new McpPromptAnnotation(
        "special-char-prompt",
        "Special character prompt",
        "TestService",
        [
          {
            name: "special",
            title: "Special Characters",
            description: "Prompt with special characters",
            template: "Special: {{value}} & more {{value}} \\n {{value}}",
            role: "user",
            inputs: [{ key: "value", type: "String" }],
          },
        ],
      );

      assignPromptToServer(specialCharPrompt, mockServer as any as McpServer);

      const promptHandler = mockServer.registerPrompt.mock.calls[0][2];
      const result = await promptHandler({ value: "test" });

      expect(result).toEqual({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Special: test & more test \\n test",
            },
          },
        ],
      });
    });
  });
});
