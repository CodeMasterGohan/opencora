import { describe, expect, test } from "bun:test"
import { providerOptions } from "../../../../src/component/dialog-provider"

describe("providerOptions", () => {
  test("includes only openai, openrouter, and openai-compatible providers in priority order", () => {
    expect(
      providerOptions([
        { id: "openai-compatible", name: "OpenAI Compatible" },
        { id: "openai", name: "OpenAI" },
        { id: "openrouter", name: "OpenRouter" },
        { id: "custom-openai-z", name: "Zebra OpenAI Provider" },
        { id: "anthropic", name: "Anthropic" },
        { id: "mistral", name: "Mistral" },
        { id: "aws", name: "AWS Bedrock" },
      ]).map((option) => option.value),
    ).toEqual(["openai", "openrouter", "openai-compatible"])
  })
})
