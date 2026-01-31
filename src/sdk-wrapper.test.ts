import { test, expect, describe, beforeAll } from "bun:test";
import { $ } from "bun";

beforeAll(async () => {
  await $`bun run build`.quiet();
});

describe("V3 to V2 transformation", () => {
  function convertFinishReason(reason: unknown): string {
    if (typeof reason === "string") return reason;
    if (reason && typeof reason === "object" && "unified" in reason) {
      return (reason as { unified: string }).unified;
    }
    return "other";
  }

  function normalizeFinishReason(obj: Record<string, unknown>): Record<string, unknown> {
    if (!("finishReason" in obj)) return obj;
    return { ...obj, finishReason: convertFinishReason(obj.finishReason) };
  }

  function transformStreamPart(part: unknown): unknown {
    if (!part || typeof part !== "object") return part;
    return normalizeFinishReason(part as Record<string, unknown>);
  }

  function normalizeGenerateResult(result: unknown): unknown {
    if (!result || typeof result !== "object") return result;
    const normalized = normalizeFinishReason(result as Record<string, unknown>);
    if (Array.isArray((normalized as any).steps)) {
      return {
        ...normalized,
        steps: (normalized as any).steps.map((step: unknown) =>
          step && typeof step === "object" ? normalizeFinishReason(step as Record<string, unknown>) : step
        ),
      };
    }
    return normalized;
  }

  test("converts V3 finish reason object to string", () => {
    expect(convertFinishReason({ unified: "stop", raw: "end_turn" })).toBe("stop");
    expect(convertFinishReason({ unified: "length", raw: "max_tokens" })).toBe("length");
    expect(convertFinishReason({ unified: "tool-calls", raw: "tool_use" })).toBe("tool-calls");
  });

  test("passes through V2 string finish reasons", () => {
    expect(convertFinishReason("stop")).toBe("stop");
    expect(convertFinishReason("length")).toBe("length");
  });

  test("returns 'other' for unknown formats", () => {
    expect(convertFinishReason(null)).toBe("other");
    expect(convertFinishReason(undefined)).toBe("other");
    expect(convertFinishReason({})).toBe("other");
  });

  test("normalizes any stream part with finishReason", () => {
    const finishPart = { type: "finish", finishReason: { unified: "stop", raw: "end_turn" }, usage: {} };
    expect((transformStreamPart(finishPart) as any).finishReason).toBe("stop");

    const finishStepPart = { type: "finish-step", finishReason: { unified: "length", raw: "max_tokens" } };
    expect((transformStreamPart(finishStepPart) as any).finishReason).toBe("length");

    const unknownPart = { type: "some-new-type", finishReason: { unified: "error", raw: "internal" } };
    expect((transformStreamPart(unknownPart) as any).finishReason).toBe("error");
  });

  test("passes through parts without finishReason unchanged", () => {
    const textDelta = { type: "text-delta", textDelta: "Hello" };
    expect(transformStreamPart(textDelta)).toEqual(textDelta);

    const toolCall = { type: "tool-call", toolName: "read_file" };
    expect(transformStreamPart(toolCall)).toEqual(toolCall);
  });

  test("normalizes steps[].finishReason in generate results", () => {
    const result = {
      text: "Hello",
      finishReason: { unified: "stop", raw: "end_turn" },
      steps: [
        { finishReason: { unified: "tool-calls", raw: "tool_use" }, text: "step1" },
        { finishReason: { unified: "stop", raw: "end_turn" }, text: "step2" },
      ],
    };

    const normalized = normalizeGenerateResult(result) as any;
    expect(normalized.finishReason).toBe("stop");
    expect(normalized.steps[0].finishReason).toBe("tool-calls");
    expect(normalized.steps[1].finishReason).toBe("stop");
  });

  test("handles generate result without steps", () => {
    const result = { text: "Hello", finishReason: { unified: "stop", raw: "end_turn" } };
    const normalized = normalizeGenerateResult(result) as any;
    expect(normalized.finishReason).toBe("stop");
    expect(normalized.text).toBe("Hello");
  });
});

describe("claude-code provider integration", () => {
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
