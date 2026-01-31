import { test, expect, describe, beforeAll } from "bun:test";
import { $ } from "bun";

beforeAll(async () => {
  await $`bun run build`.quiet();
});

describe("claude-code provider", () => {
  test("claude-code/sonnet responds to prompt", async () => {
    const result = await $`opencode run --model claude-code/sonnet "Say hi"`.text();
    expect(result).toContain("Hi");
  }, 30000);

  test("claude-code/haiku responds to prompt", async () => {
    const result = await $`opencode run --model claude-code/haiku "What is 2+2? Answer with just the number."`.text();
    expect(result).toContain("4");
  }, 30000);

  test("claude-code/opus responds to prompt", async () => {
    const result = await $`opencode run --model claude-code/opus "Say hello"`.text();
    expect(result.toLowerCase()).toContain("hello");
  }, 60000);
});
