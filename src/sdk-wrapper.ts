import { 
  createClaudeCode as originalCreateClaudeCode, 
  type ClaudeCodeSettings,
  claudeCode,
  ClaudeCodeLanguageModel,
  isAuthenticationError,
  isTimeoutError,
  getErrorMetadata,
} from "ai-sdk-provider-claude-code";
import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";

const IGNORED_OPTIONS = new Set(["apiKey", "baseURL", "headers", "fetch", "name", "includeUsage"]);

function findClaudeCli(): string {
  const candidates = [
    join(homedir(), ".local", "bin", "claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
  ];
  
  for (const path of candidates) {
    if (existsSync(path)) {
      return path;
    }
  }
  
  return "claude";
}

function filterSettings(options?: Record<string, unknown>): ClaudeCodeSettings | undefined {
  if (!options) return undefined;
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) {
    if (!IGNORED_OPTIONS.has(key)) {
      filtered[key] = value;
    }
  }
  return Object.keys(filtered).length > 0 ? (filtered as ClaudeCodeSettings) : undefined;
}

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

/**
 * Creates a transformed stream that converts V3 parts to V2 format
 */
function createV2CompatibleStream(v3Stream: ReadableStream): ReadableStream {
  const reader = v3Stream.getReader();
  
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(transformStreamPart(value));
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() {
      reader.cancel();
    },
  });
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

function wrapLanguageModel<T extends object>(model: T): T {
  return new Proxy(model, {
    get(target, prop, receiver) {
      if (prop === "specificationVersion") return "v2";

      if (prop === "doStream") {
        const original = (target as any).doStream.bind(target);
        return async (options: any) => {
          const result = await original(options);
          return { ...result, stream: createV2CompatibleStream(result.stream) };
        };
      }

      if (prop === "doGenerate" && (target as any).doGenerate) {
        const original = (target as any).doGenerate.bind(target);
        return async (options: any) => {
          const result = await original(options);
          return normalizeGenerateResult(result);
        };
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}

export function createClaudeCode(options?: Parameters<typeof originalCreateClaudeCode>[0]) {
  const claudeCliPath = findClaudeCli();
  
  const provider = originalCreateClaudeCode({
    ...options,
    defaultSettings: {
      ...options?.defaultSettings,
      pathToClaudeCodeExecutable: claudeCliPath,
    },
  });
  
  return {
    languageModel(modelId: string, modelOptions?: Record<string, unknown>) {
      return wrapLanguageModel(provider.languageModel(modelId, filterSettings(modelOptions)));
    },
    chat(modelId: string, modelOptions?: Record<string, unknown>) {
      return wrapLanguageModel(provider.chat(modelId, filterSettings(modelOptions)));
    },
  };
}

export { 
  claudeCode,
  ClaudeCodeLanguageModel,
  isAuthenticationError,
  isTimeoutError,
  getErrorMetadata,
};
